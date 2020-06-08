import {
    AnyFile,
    CopyOperation,
    CopyOptions, DeleteOptions,
    FileContent,
    LocalFile,
    Optional, OverwriteOptions,
    Scanned,
    ScannedFile,
    WriteRequest
} from "../api";
import {AbstractFileService, isS3File} from "../file-service";
import {S3FileService, S3WriteOptions} from "../s3";
import {LocalFileService} from "./local-file-service";

export class NodeFileService extends AbstractFileService<AnyFile, S3WriteOptions> {

    constructor(private lFs: LocalFileService, private s3Fs: S3FileService) {
        super();
    }

    toDelegate<T extends LocalFile>(file: AnyFile): AbstractFileService<T, S3WriteOptions> {
        // TODO: Find another way to return a valid delegate without casting to any
        return isS3File(file) ? this.s3Fs : this.lFs as any;
    }

    async waitForFileToExist(file: AnyFile): Promise<void> {
        await this.toDelegate(file).waitForFileToExist(file);
    }

    async readFile(file: ScannedFile): Promise<FileContent> {
        return this.toDelegate(file).readFile(file);
    }

    scan<T extends LocalFile>(file: T): Promise<Optional<Scanned<T>>> {
        return this.toDelegate<T>(file).scan(file);
    }

    async deleteFile<T extends Scanned<LocalFile>>(file: T, options: DeleteOptions<T>): Promise<void> {
        return this.toDelegate(file).delete(file, options);
    }

    list<T extends LocalFile>(fileOrFolder: T): AsyncIterable<Scanned<T>[]> {
       return this.toDelegate<T>(fileOrFolder).list(fileOrFolder);
    }

    protected existingOnly<T>(items: Optional<T>[]): T[] {
        return items.filter(item => item.exists).map(item => item.value);
    }

    toLocationString(input: AnyFile): string {
        return this.toDelegate(input).toLocationString(input);
    }

    async writeFile(request: WriteRequest<AnyFile>,
                    options: OverwriteOptions & S3WriteOptions): Promise<void> {
        return this.toDelegate(request.destination).writeFile(request, options);
    }

    async copyFile<A extends AnyFile, B extends AnyFile>
    (request: CopyOperation<A, B>, options: CopyOptions<A, B> & S3WriteOptions): Promise<void> {
        const sourceDelegate = await this.toDelegate(request.source);
        const destinationDelegate = await this.toDelegate(request.destination);
        if (sourceDelegate === destinationDelegate) {
            await sourceDelegate.copyFile(request, options);
        } else {
            await destinationDelegate.writeFile({
                destination: request.destination,
                body: await sourceDelegate.readFile(request.source)
            }, options);
        }
    }

}
