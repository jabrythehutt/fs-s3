import {AbstractFileService} from "./abstract-file-service";
import {
    CopyOperation,
    CopyOptions,
    DeleteOptions,
    FileContent,
    LocalFile,
    Optional,
    OverwriteOptions,
    Scanned,
    WriteRequest
} from "@jabrythehutt/fs-s3-core";

export class PolyFileService<A extends LocalFile, B extends LocalFile, W>
    extends AbstractFileService<A | B, W> {

    constructor(private delegateResolver: <T extends A | B>(file: T) => AbstractFileService<T, W>) {
        super();
    }

    async copyFile<FA extends A | B, FB extends A | B>(request: CopyOperation<FA, FB>,
                                                 options: CopyOptions<FA, FB> & W): Promise<void> {
        const sourceDelegate = this.delegateResolver<FA | FB>(request.source);
        const destinationDelegate = this.delegateResolver<FA | FB>(request.destination);
        if (sourceDelegate === destinationDelegate) {
            await sourceDelegate.copyFile(request, options);
        } else {
            await destinationDelegate.writeFile({
                destination: request.destination,
                body: await sourceDelegate.readFile(request.source)
            }, options);
        }
    }

    deleteFile(file: Scanned<A | B>, options: DeleteOptions<A | B>): Promise<void> {
        return this.delegateResolver(file).deleteFile(file, options);
    }

    list<F extends A | B>(fileOrFolder: F): AsyncIterable<Scanned<F>> {
        return this.delegateResolver(fileOrFolder).list<F>(fileOrFolder);
    }

    readFile(file: Scanned<A | B>): Promise<FileContent> {
        return this.delegateResolver(file).readFile(file);
    }

    scan<F extends A | B>(f: F): Promise<Optional<Scanned<F>>> {
        return this.delegateResolver(f).scan<F>(f);
    }

    toLocationString(f: A | B): string {
        return this.delegateResolver(f).toLocationString(f);
    }

    waitForFileToExist(f: A | B): Promise<void> {
        return this.delegateResolver(f).waitForFileToExist(f);
    }

    writeFile(request: WriteRequest<A | B>, options: OverwriteOptions & W): Promise<void> {
        return this.delegateResolver(request.destination).writeFile(request, options);
    }

    parse<F extends A | B>(fileOrFolder: F): F {
        return this.delegateResolver(fileOrFolder).parse(fileOrFolder);
    }
}