import {GenericFileService} from "./generic-file-service";
import {LocalFile} from "./local-file";
import {CopyRequest} from "./copy-request";
import {Scanned} from "./scanned";
import {FileContent} from "./file-content";
import {WriteRequest} from "./write-request";
import {CopyOptions} from "./copy-options";
import {CopyOperation} from "./copy-operation";
import {ResolveDestinationRequest} from "./resolve-destination-request";
import {AsyncIterator} from "./async.iterator";
import {chunksOf} from "fp-ts/lib/Array";
import {DeleteOptions} from "./delete-options";

export abstract class AbstractFileService<T extends LocalFile> implements GenericFileService<T> {

    async copy<A extends T, B extends T>(request: CopyRequest<A, B>): Promise<void> {
        const sourceFilesIterator = await this.getListIterator(request.source);
        while (sourceFilesIterator.hasNext()) {
            const sourceFiles = await sourceFilesIterator.next();
            await this.copyFiles(request, sourceFiles);
        }
    }

    async list(folder: T): Promise<Scanned<T>[]> {
        const files = [];
        const listIterator = await this.getListIterator(folder);
        while (listIterator.hasNext()) {
            const newFiles = await listIterator.next();
            files.push(...newFiles);
        }
        return files;
    }

    async copyFiles<A extends T, B extends T>(request: CopyRequest<A, B>, sourceFiles: Scanned<A>[]): Promise<void> {
        const copyOperations = sourceFiles.map(source => ({
            destination: this.toDestination({
                source,
                destinationFolder: request.destination,
                sourceFolder: request.source.key
            }),
            source
        }));

        const chunks = chunksOf(request.options.concurrency)(copyOperations);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(async operation => {
                if (await this.proceedWithCopy(operation, request.options)) {
                    await this.copyFile<A, B>(operation, request.options);
                    if (request.options.copyListener) {
                        request.options.copyListener(operation);
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


    willAlwaysOverwrite<A extends T, B extends T>(options: CopyOptions<A, B>): boolean {
        return options.overwrite && !options.skipSame;
    }

    overwriteDestination<A extends T, B extends T>(sourceFile: Scanned<A>,
                                                   destination: Scanned<B>,
                                                   options: CopyOptions<A, B>): boolean {
        if (!options.overwrite) {
            return false;
        }
        return !(this.sameContent(sourceFile, destination) && options.skipSame);
    }

    async proceedWithCopy<A extends T, B extends T>(operation: CopyOperation<A, B>, options: CopyOptions<A, B>):
        Promise<boolean> {
        // Don't bother checking the destination file if it'll always be overwritten
        if (this.willAlwaysOverwrite(options)) {
            return true;
        }

        if (this.sameLocation(operation.source, operation.destination)) {
            return false;
        }

        const scannedDestination = await this.scan(operation.destination);

        if (!scannedDestination) {
            return true;
        }
        return this.overwriteDestination(operation.source, scannedDestination, options);
    }

    toDestination<A extends T, B extends T>(request: ResolveDestinationRequest<A, B>): B {
        return {
            ...request.destinationFolder,
            key: request.source.key.replace(request.sourceFolder, request.destinationFolder.key)
        };
    }

    async delete(fileOrFolder: T, options?: DeleteOptions): Promise<void> {
        const iterator = await this.getListIterator(fileOrFolder);
        while (iterator.hasNext()) {
            const batch = await iterator.next();
            const chunks = chunksOf(options.concurrency)(batch);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(f => this.deleteFile(f, options)));
            }
        }
    }

    abstract copyFile<A extends T, B extends T>(request: CopyOperation<A, B>, options: CopyOptions<A, B>):
        Promise<void>;

    abstract toLocationString(f: T): string;

    abstract scan(f: T): Promise<Scanned<T> | undefined>;

    abstract deleteFile(files: Scanned<T>, options: DeleteOptions): Promise<void>;

    abstract getListIterator(folder: T): Promise<AsyncIterator<Scanned<T>[]>>;

    abstract read(file: T): Promise<FileContent>;

    abstract write(request: WriteRequest<T>): Promise<Scanned<T>>;

}