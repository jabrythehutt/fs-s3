import {
    CopyOperation,
    CopyOptions,
    CopyRequest,
    DeleteOptions,
    FileContent,
    FpOptional,
    GenericFileService,
    InputRequest,
    LocalFile,
    Optional,
    OutputRequest,
    OverwriteOptions,
    Scanned,
    WriteRequest
} from "@jabrythehutt/fs-s3-core";
import {ResolveDestinationRequest} from "./resolve-destination-request";
import {defaultCopyOptions} from "./default-copy-options";
import {defaultConcurrencyOptions} from "./default-concurrency-options";
import {defaultWriteOptions} from "./default-write-options";

export abstract class AbstractFileService<T extends LocalFile, W = unknown> implements GenericFileService<T, W> {

    async copy<A extends T = T, B extends T = T>(inputRequest: CopyRequest<A, B>, options?: CopyOptions<A, B> & W):
        Promise<void> {
        options = {
            ...defaultCopyOptions,
            ...options
        };
        const request = this.parseIORequest(inputRequest);
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

    protected sameLocation(f1: T, f2: T): boolean {
        return this.toLocationString(f1) === this.toLocationString(f2);
    }

    protected sameContent(f1: Scanned<T>, f2: Scanned<T>): boolean {
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

    protected async proceedWithCopy<A extends T = T, B extends T = T>(
        operation: CopyOperation<A, B>, options: CopyOptions<A, B> & W): Promise<boolean> {

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

    async delete(inputFileOrFolder: T, options?: DeleteOptions<T>): Promise<void> {
        options = {
            ...defaultConcurrencyOptions,
            ...options
        };
        const fileOrFolder = this.parse(inputFileOrFolder);
        await this.processList(this.list(fileOrFolder), async f => {
            await this.deleteFile(f, options);
            if (options.listener) {
                options.listener(f);
            }
        }, options.concurrency);
    }

    async waitForFile<F extends T = T>(inputFile: F): Promise<Scanned<F>> {
        const file = this.parse(inputFile);
        await this.waitForFileToExist(file);
        const result = await this.scan(file);
        return result.value;
    }

    protected async writeAndScanFile<F extends T>(request: WriteRequest<F>,
                                     options: OverwriteOptions & W): Promise<Optional<Scanned<F>>> {
        await this.writeFile(request, options);
        return this.scan(request.destination);
    }

    async write<F extends T = T>(inputRequest: WriteRequest<F>, options?: OverwriteOptions & W):
        Promise<Optional<Scanned<F>>> {
        options = {
            ...defaultWriteOptions,
            ...options,
        }
        const request = this.parseOutputRequest(inputRequest);
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

    async read(inputFile: T): Promise<Optional<FileContent>> {
        const file = this.parse(inputFile);
        const scannedFile = await this.scan(file);
        // TODO: Use a cleaner function way to deal with wrapped optional values
        if (scannedFile.exists) {
           const result = await this.readFile(scannedFile.value);
           return FpOptional.of(result);
        }
        return FpOptional.empty();
    }

    protected parseField<A, T extends keyof A>(input: A, field: T, parser: (input: A[T]) => A[T]): A {
        return {
            ...input,
            [field]: parser(input[field])
        };
    }

    protected parseInputRequest<F extends T, R extends InputRequest<F>>(request: R): R {
        return this.parseField(request, "source", f => this.parse(f));
    }

    protected parseOutputRequest<F extends T, R extends OutputRequest<F>>(request: R): R {
        return this.parseField(request, "destination", f => this.parse(f));
    }

    protected parseIORequest<F extends T, R extends InputRequest<F> & OutputRequest<F>>(request: R): R {
        return this.parseInputRequest(this.parseOutputRequest(request));
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

    abstract parse<F extends T = T>(fileOrFolder: F): F;

}