import {
    AnyFile,
    CopyOperation,
    CopyOptions, CopyRequest, DeleteOptions,
    FileContent,
    LocalFile,
    Optional, OverwriteOptions, S3File,
    Scanned,
    ScannedFile,
    WriteRequest
} from "../api";
import {AbstractFileService, isS3File} from "../file-service";
import {parseS3File, S3FileService, S3WriteOptions} from "../s3";
import {LocalFileService} from "./local-file-service";
import {parseLocalFile} from "./parse-local-file";
import {parsedInputRequest} from "../file-service/parsed-input-request";
import {parsedOutputRequest} from "../file-service/parsed-output-request";

const anyFileParser = (f: AnyFile) => isS3File(f) ? parseS3File(f as S3File) : parseLocalFile(f);
const anySourceRequest =  parsedInputRequest(anyFileParser);
const anyDestinationRequest = parsedOutputRequest(anyFileParser);

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
        return this.toDelegate(file).deleteFile(file, options);
    }

    list<T extends LocalFile>(fileOrFolder: T): AsyncIterable<Scanned<T>> {
       return this.toDelegate<T>(fileOrFolder).list(fileOrFolder);
    }

    toLocationString(input: AnyFile): string {
        return this.toDelegate(input).toLocationString(input);
    }

    async writeFile(request: WriteRequest<AnyFile>,
                    options: OverwriteOptions & S3WriteOptions): Promise<void> {
        return this.toDelegate(request.destination).writeFile(request, options);
    }

    async copy<A extends AnyFile, B extends AnyFile>(
        @anySourceRequest
        @anyDestinationRequest request: CopyRequest<A, B>,
        options?: CopyOptions<A, B> & S3WriteOptions): Promise<void> {
        return super.copy(request, options);
    }

    async copyFile<A extends AnyFile, B extends AnyFile>(
        @anySourceRequest
        @anyDestinationRequest request: CopyOperation<A, B>,
        options: CopyOptions<A, B> & S3WriteOptions): Promise<void> {
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
