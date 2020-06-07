import {GenericFileService} from "./generic-file-service";
import {LocalFile} from "./local-file";
import {CopyRequest} from "./copy-request";
import {Scanned} from "./scanned";
import {FileContent} from "./file-content";
import {WriteRequest} from "./write-request";
import {CopyOptions} from "./copy-options";
import {CopyOperation} from "./copy-operation";
import {ResolveDestinationRequest} from "./resolve-destination-request";
import {chunksOf} from "fp-ts/lib/Array";
import {DeleteOptions} from "./delete-options";
import {Optional} from "./optional";
import {OverwriteOptions} from "./overwrite-options";
import {pipe} from "fp-ts/lib/pipeable";
import {toUndefined, map, fromNullable} from "fp-ts/lib/Option";
import {FpOptional} from "./fp.optional";
import {defaultCopyOptions} from "./default-copy-options";
import {defaultConcurrencyOptions} from "./default-concurrency-options";
import {defaultS3WriteOptions} from "../s3/default-s3-write-options";
import {defaultWriteOptions} from "./default-write-options";

export abstract class AbstractFileService<T extends LocalFile, W> implements GenericFileService<T, W> {

    async copy<A extends T, B extends T>(request: CopyRequest<A, B>, options?: CopyOptions<A, B> & W): Promise<void> {
        options = {
            ...defaultCopyOptions,
            ...options
        };
        const sourceFilesIterator = this.list(request.source);
        for await (const sourceFiles of sourceFilesIterator) {
            await this.copyFiles(request, sourceFiles, options);
        }
    }

    protected async copyFiles<A extends T, B extends T>(request: CopyRequest<A, B>,
                                              sourceFiles: Scanned<A>[],
                                              options: CopyOptions<A, B> & W): Promise<void> {
        const copyOperations = sourceFiles.map(source => ({
            destination: this.toDestination({
                source,
                destinationFolder: request.destination,
                sourceFolder: request.source.key
            }),
            source
        }));

        const chunks = chunksOf(options.concurrency)(copyOperations);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(async operation => {
                if (await this.proceedWithCopy(operation, options)) {
                    await this.copyFile<A, B>(operation, options);
                    if (options.listener) {
                        options.listener(operation);
                    }
                }
            }));
        }
    }

    sameLocation(f1: T, f2: T): boolean {
        return this.toLocationString(f1) === this.toLocationString(f2);
    }

    sameContent(f1: Scanned<T>, f2: Scanned<T>): boolean {
        return f1.md5 === f2.md5;
    }


    protected willAlwaysOverwrite<A extends T, B extends T>(options: CopyOptions<A, B> & W): boolean {
        return options.overwrite && !options.skipSame;
    }

    protected overwriteDestination<A extends T, B extends T>(sourceFile: Scanned<A>,
                                                   destination: Scanned<B>,
                                                   options: CopyOptions<A, B> & W): boolean {
        if (!options.overwrite) {
            return false;
        }
        return !(this.sameContent(sourceFile, destination) && options.skipSame);
    }

    async proceedWithCopy<A extends T, B extends T>(operation: CopyOperation<A, B>, options: CopyOptions<A, B> & W):
        Promise<boolean> {

        if (this.sameLocation(operation.source, operation.destination)) {
            return false;
        }

        // Don't bother checking the destination file if it'll always be overwritten
        if (this.willAlwaysOverwrite(options)) {
            return true;
        }

        const scannedDestination = await this.scan(operation.destination);
        return !scannedDestination.exists ||
            this.overwriteDestination(operation.source, scannedDestination.value, options);
    }

    protected toDestination<A extends T, B extends T>(request: ResolveDestinationRequest<A, B>): B {
        return {
            ...request.destinationFolder,
            key: request.source.key.replace(request.sourceFolder, request.destinationFolder.key)
        };
    }

    async delete(fileOrFolder: T, options?: DeleteOptions<T>): Promise<void> {
        options = {
            ...defaultConcurrencyOptions,
            ...options
        };
        const iterator = this.list(fileOrFolder);
        for await (const batch of iterator) {
            const chunks = chunksOf(options.concurrency)(batch);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(async f => {
                    await this.deleteFile(f, options);
                    if (options.listener) {
                        options.listener(f);
                    }
                }));
            }
        }
    }

    async waitForFile(file: T): Promise<Scanned<T>> {
        await this.waitForFileToExist(file);
        const result = await this.scan(file);
        return result.value;
    }

    protected async writeAndScanFile(request: WriteRequest<T>,
                                     options: OverwriteOptions & W): Promise<Optional<Scanned<T>>> {
        await this.writeFile(request, options);
        return this.scan(request.destination);
    }

    async write(request: WriteRequest<T>, options?: OverwriteOptions & W): Promise<Optional<Scanned<T>>> {
        options = {
            ...defaultWriteOptions,
            ...options,
        }
        if (options.overwrite) {
            return this.writeAndScanFile(request, options);
        } else {
            const existingFile = await this.scan(request.destination);
            if (!existingFile.exists) {
                return this.writeAndScanFile(request, options);
            } else {
                return existingFile;
            }
        }
    }

    async read(file: T): Promise<Optional<FileContent>> {
        const scannedFile = await this.scan(file);
        if (scannedFile.exists) {
           const result = await this.readFile(scannedFile.value);
           return FpOptional.of(result);
        }
        return FpOptional.empty();
    }

    protected abstract copyFile<A extends T, B extends T>(request: CopyOperation<A, B>, options: CopyOptions<A, B> & W):
        Promise<void>;

    abstract toLocationString(f: T): string;

    abstract scan(f: T): Promise<Optional<Scanned<T>>>;

    abstract readFile(file: Scanned<T>): Promise<FileContent>;

    protected abstract waitForFileToExist(f: T): void;

    protected abstract deleteFile(files: Scanned<T>, options: DeleteOptions<T>): Promise<void>;

    protected abstract writeFile(request: WriteRequest<T>, options: OverwriteOptions & W): Promise<void>;

    abstract list(fileOrFolder: T): AsyncIterable<Scanned<T>[]>;

}