import {GenericFileService} from "./generic-file-service";
import {
    CopyOperation,
    CopyOptions,
    CopyRequest,
    defaultConcurrencyOptions,
    defaultCopyOptions,
    defaultWriteOptions,
    DeleteOptions,
    FileContent,
    LocalFile,
    Optional,
    OverwriteOptions,
    Scanned,
    WriteRequest
} from "../api";
import {ResolveDestinationRequest} from "./resolve-destination-request";
import {FpOptional} from "./fp-optional";

export abstract class AbstractFileService<T extends LocalFile, W = unknown> implements GenericFileService<T, W> {

    async copy<A extends T = T, B extends T = T>(request: CopyRequest<A, B>, options?: CopyOptions<A, B> & W):
        Promise<void> {
        options = {
            ...defaultCopyOptions,
            ...options
        };
        await this.processList(this.list(request.source), async source => {
            const operation = {
                destination: this.toDestination({
                    source,
                    destinationFolder: request.destination,
                    sourceFolder: request.source.key
                }),
                source
            };
            if (await this.proceedWithCopy(operation, options)) {
                await this.copyFile<A, B>(operation, options);
                if (options.listener) {
                    options.listener(operation);
                }
            }
        }, options.concurrency);
    }

    protected async copyFiles<A extends T = T, B extends T = T>(request: CopyRequest<A, B>,
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

        await Promise.all(copyOperations.map(async operation => {
            if (await this.proceedWithCopy(operation, options)) {
                await this.copyFile<A, B>(operation, options);
                if (options.listener) {
                    options.listener(operation);
                }
            }
        }));
    }

    sameLocation(f1: T, f2: T): boolean {
        return this.toLocationString(f1) === this.toLocationString(f2);
    }

    sameContent(f1: Scanned<T>, f2: Scanned<T>): boolean {
        return f1.md5 === f2.md5;
    }


    protected willAlwaysOverwrite<A extends T = T, B extends T = T>(options: CopyOptions<A, B> & W): boolean {
        return options.overwrite && !options.skipSame;
    }

    protected overwriteDestination<A extends T = T, B extends T = T>(sourceFile: Scanned<A>,
                                                   destination: Scanned<B>,
                                                   options: CopyOptions<A, B> & W): boolean {
        if (!options.overwrite) {
            return false;
        }
        return !(this.sameContent(sourceFile, destination) && options.skipSame);
    }

    async proceedWithCopy<A extends T = T, B extends T = T>(operation: CopyOperation<A, B>,
                                                            options: CopyOptions<A, B> & W): Promise<boolean> {

        // TODO: Use a fp-ts pipe to clean up the conditional copy logic
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

    protected async processList<V> (iterable: AsyncIterable<V>,
                                   processor: (item: V) => Promise<void>,
                                   concurrency: number): Promise<void> {
        // TODO Find a cleaner way of creating batches from async iterators
        let batch = [];
        const flushBatch = async () => {
            await Promise.all(batch.map(v => processor(v)));
            batch = [];
        }
        for await (const item of iterable) {
            batch.push(item);
            if (batch.length >= concurrency) {
                await flushBatch();
            }
        }
        await flushBatch();


    }

    async delete(fileOrFolder: T, options?: DeleteOptions<T>): Promise<void> {
        options = {
            ...defaultConcurrencyOptions,
            ...options
        };
        await this.processList(this.list(fileOrFolder), async f => {
            await this.deleteFile(f, options);
            if (options.listener) {
                options.listener(f);
            }
        }, options.concurrency);
    }

    async waitForFile<F extends T = T>(file: F): Promise<Scanned<F>> {
        await this.waitForFileToExist(file);
        const result = await this.scan(file);
        return result.value;
    }

    protected async writeAndScanFile<F extends T>(request: WriteRequest<F>,
                                     options: OverwriteOptions & W): Promise<Optional<Scanned<F>>> {
        await this.writeFile(request, options);
        return this.scan(request.destination);
    }

    async write<F extends T = T>(request: WriteRequest<F>, options?: OverwriteOptions & W):
        Promise<Optional<Scanned<F>>> {
        options = {
            ...defaultWriteOptions,
            ...options,
        }
        if (options.overwrite) {
            return this.writeAndScanFile(request, options);
        } else {
            // TODO: Use a cleaner function way to deal with wrapped optional values
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
        // TODO: Use a cleaner function way to deal with wrapped optional values
        if (scannedFile.exists) {
           const result = await this.readFile(scannedFile.value);
           return FpOptional.of(result);
        }
        return FpOptional.empty();
    }

    abstract copyFile<A extends T = T, B extends T = T>(request: CopyOperation<A, B>, options: CopyOptions<A, B> & W):
        Promise<void>;

    abstract toLocationString(f: T): string;

    abstract scan<F extends T = T>(f: F): Promise<Optional<Scanned<F>>>;

    abstract readFile(file: Scanned<T>): Promise<FileContent>;

    abstract waitForFileToExist(f: T): Promise<void>;

    abstract deleteFile(file: Scanned<T>, options: DeleteOptions<T>): Promise<void>;

    abstract writeFile(request: WriteRequest<T>, options: OverwriteOptions & W): Promise<void>;

    abstract list<F extends T = T>(fileOrFolder: F): AsyncIterable<Scanned<F>>;

}