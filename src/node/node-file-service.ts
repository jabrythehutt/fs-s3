import {normalize, sep} from "path";
import {
    AnyFile,
    CopyOperation,
    CopyOptions,
    FileContent,
    LocalFile,
    Optional, OverwriteOptions,
    S3File,
    Scanned,
    ScannedFile,
    ScannedS3File,
    WriteRequest
} from "../api";
import {AbstractFileService} from "../file-service";
import {S3FileService, S3WriteOptions} from "../s3";
import {bimap, Either, fold, left, right} from "fp-ts/lib/Either";
import {pipe} from "fp-ts/lib/pipeable";
import {LocalFileService} from "./local-file-service";

export class NodeFileService extends AbstractFileService<AnyFile, S3WriteOptions> {

    constructor(private lFs: LocalFileService, private s3Fs: S3FileService) {
        super();
    }

    protected toEither<T extends S3File, L extends LocalFile>(f: AnyFile): Either<T, L> {
        return this.isS3File(f) ? left(this.toS3File(f)) : right(this.toLocalFile(f));
    }

    waitForFileToExist(file: AnyFile): Promise<void> {
        return pipe(
            this.toEither(file),
            fold(f => this.s3Fs.waitForFileToExist(f),
                f => this.lFs.waitForFileToExist(f)
            )
        );
    }

    async readFile(file: ScannedFile): Promise<FileContent> {
        return pipe(
            this.toEither<ScannedS3File, Scanned<LocalFile>>(file),
            fold(
                f => this.s3Fs.readFile(f),
                f => this.lFs.readFile(f)
            )
        )
    }

    scan<T extends LocalFile>(file: T): Promise<Optional<Scanned<T>>> {
        return pipe(
            this.toEither(file),
            fold(
                f => this.s3Fs.scan(f),
                f => this.lFs.scan(f)
            )
        ) as Promise<Optional<Scanned<T>>>;
    }

    async deleteFile<T extends Scanned<LocalFile>>(file: T, options): Promise<void> {
        return pipe(
            this.toEither<ScannedS3File, Scanned<LocalFile>>(file),
            fold(f => this.s3Fs.deleteFile(f, options),
                f => this.lFs.deleteFile(f, options)
            )
        );
    }

    list<T extends LocalFile>(fileOrFolder: T): AsyncIterable<Scanned<T>[]> {
        return pipe(
            this.toEither(fileOrFolder),
            fold(
                f => this.s3Fs.list(f),
                f => this.lFs.list(f)
            )
        ) as AsyncIterable<Scanned<T>[]>;
    }

    protected existingOnly<T>(items: Optional<T>[]): T[] {
        return items.filter(item => item.exists).map(item => item.value);
    }

    toLocationString(input: AnyFile): string {
        return pipe(
            this.toEither(input),
            fold(
                s3File => this.s3Fs.toLocationString(s3File),
                localFile => this.lFs.toLocationString(localFile)
            )
        )

    }

    async write(request: WriteRequest<AnyFile>, options?: OverwriteOptions & S3WriteOptions):
        Promise<Optional<Scanned<AnyFile>>> {
        return super.write(request as WriteRequest<S3File>, options);
    }

    async writeFile(request: WriteRequest<AnyFile>,
                              options: OverwriteOptions & S3WriteOptions): Promise<void> {
        const mapBoth = (f) => bimap(f, f);
        return pipe(
            this.toEither(request.destination),
            mapBoth(f => ({...request, destination: f})),
            fold(
                (s3Request: WriteRequest<S3File>) => this.s3Fs.writeFile(s3Request, options),
                async (localRequest: WriteRequest<LocalFile>) => this.lFs.writeFile(localRequest, options)
            )
        )
    }

    async copyFile<A extends AnyFile, B extends AnyFile>
    (request: CopyOperation<A, B>, options: CopyOptions<A, B> & S3WriteOptions): Promise<void> {

        const mapBoth = f => bimap(f, f);
        const correctedRequest = pipe(
            this.toEither(request.source),
            mapBoth(source => ({
                ...request,
                source
            })),
            mapBoth(r => pipe(
                this.toEither(r.destination),
                mapBoth(destination => ({...r, destination}))
            ))
        )

        const foldNested = (a, b, c, d) => fold(
            fold(a, b),
            fold(c, d)
        );

        return pipe(
            correctedRequest,
            foldNested(
                s3ToS3 => this.s3Fs.copyFile(s3ToS3, options as CopyOptions<S3File, S3File>),
                s3ToLocal => this.copyS3ToLocal(s3ToLocal, options as CopyOptions<S3File, LocalFile>),
                localToS3 => this.copyLocalToS3(localToS3, options as CopyOptions<LocalFile, S3File>),
                localToLocal => this.lFs.copyFile(localToLocal, options as CopyOptions<LocalFile, LocalFile>)
            )
        ) as Promise<void>;

    }


    protected async copyLocalToS3(request: CopyOperation<LocalFile, S3File>,
                                  options: CopyOptions<LocalFile, S3File> & S3WriteOptions): Promise<void> {
        await this.s3Fs.writeFile({
            body: this.lFs.readFile(request.source),
            destination: request.destination
        }, options);
    }

    protected async copyS3ToLocal(request: CopyOperation<S3File, LocalFile>,
                                  options: CopyOptions<S3File, LocalFile>): Promise<void> {
        const body = await this.s3Fs.readFile(request.source);
        await this.lFs.writeFile({
            body,
            destination: request.destination
        }, options);
    }

    protected isS3File(input: AnyFile): boolean {
        return !!(input as S3File).bucket;
    }

    protected toLocalPath(s3Key: string): string {
        return s3Key.split("/").join(sep);
    }

    protected toLocalFile<T extends LocalFile>(file: AnyFile): T {
        return this.isS3File(file) ? file as T : {
            ...file,
            key: normalize(this.toLocalPath(file.key))
        } as T;
    }

    protected toS3File<T extends S3File>(destination: AnyFile): T {
        return this.isS3File(destination) ? {
            ...destination,
            key: this.toS3Key(destination.key)
        } as T : destination as T;
    }

    protected replacePathSepsWithForwardSlashes(input: string): string {
        return input.split(sep).join("/");
    }

    protected stripPrefixSlash(input: string): string {
        return input.startsWith("/") ? input.replace("/", "") : input;
    }

    protected toS3Key(input: string): string {
        return this.stripPrefixSlash(this.replacePathSepsWithForwardSlashes(input));
    }

}
