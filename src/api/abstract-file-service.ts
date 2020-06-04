import {GenericFileService} from "./generic-file-service";
import {LocalFile} from "./local-file";
import {CopyRequest} from "./copy-request";
import {Scanned} from "./scanned";
import {FileContent} from "./file-content";
import {WriteRequest} from "./write-request";
import {Option} from "fp-ts/lib/Option";
import {CopyOptions} from "./copy-options";
import {CopyOperation} from "./copy-operation";
import {ResolveDestinationRequest} from "./resolve-destination-request";
import {pipe} from "fp-ts/lib/pipeable";

export abstract class AbstractFileService<T extends LocalFile, O extends CopyOptions>

    implements GenericFileService<T, O> {

    async copy<A extends T, B extends T>(request: CopyRequest<A, B>, options?: O): Promise<Scanned<B>[]> {
        const sourceFiles = await this.list(request.source);
        const copyOperations = sourceFiles.map(source => this.toDestination({
            source,
            destinationFolder: request.destination,
            sourceFolder: request.source.key
        }));

    }

    async isValidCopyOperation<A extends T, B extends T>(operation: CopyOperation<A, B>, options: O): Promise<boolean> {
        // Skip the operation if it's the same location
        if (this.toLocationString(operation.source) === this.toLocationString(operation.destination)) {
            return false;
        }
        // Proceed if any destination files will always be overwritten
        if (options.overwrite && !options.skipSame) {
            return true;
        }
        const scannedDestination = await this.scan(operation.destination);

        pipe(scannedDestination, )

        if (!!existingFile && !options.overwrite) {
            return false;
        }
        const sameContent = !!existingFile && existingFile.md5 === request.source.md5;
        return !(sameContent && options.skipSame);
    }

    toDestination<A extends T, B extends T>(request: ResolveDestinationRequest<A, B>): B {
        return {
            ...request.destinationFolder,
            key: request.source.key.replace(request.sourceFolder, request.destinationFolder.key)
        };
    }

    abstract copyFile<A extends T, B extends T>(request: CopyOperation<A, B>): Promise<void>;

    abstract toLocationString(f: T): string;

    abstract scan(f: T): Option<Scanned<T>>;

    sameLocation(f1: T, f2: T): boolean {
        return this.toLocationString(f1) === this.toLocationString(f2);
    }

    sameContent(f1: Scanned<T>, f2: Scanned<T>): boolean {
        return f1.md5 === f2.md5;
    }

    abstract deleteFiles(f: Scanned<T>[]): Promise<void>;

    async delete(fileOrFolder: T): Promise<Scanned<T>[]> {
        const sourceFiles = await this.list(fileOrFolder);
        await this.deleteFiles(sourceFiles);
        return sourceFiles;
    }

    abstract list(folder: T): Promise<Scanned<T>[]>;

    abstract read(file: T): Promise<FileContent>;

    abstract write(request: WriteRequest<T>): Promise<Scanned<T>>;

}