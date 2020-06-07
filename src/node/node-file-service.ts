import {getType} from "mime";
import {
    copyFileSync,
    createReadStream,
    existsSync,
    readdirSync, readFileSync,
    statSync,
    unlinkSync,
    writeFileSync
} from "fs";
import {createHash} from "crypto";
import {normalize, parse, resolve as resolvePath, sep} from "path";
import mkdirp from "mkdirp";
import {S3FileService} from "../s3/s3-file-service";
import {AnyFile, S3File, LocalFile, Scanned, ScannedS3File, CopyRequest, ScannedFile} from "../api";
import {GenericFileService} from "../api/generic-file-service";
import {S3WriteOptions} from "../s3/s3-write-options";
import {bimap, Either, fold, left, right} from "fp-ts/lib/Either";
import {pipe} from "fp-ts/lib/pipeable";
import {Optional} from "../api/optional";
import {FpOptional} from "../api/fp.optional";
import {flatten} from "fp-ts/lib/Array";
import {Readable} from "stream";
import {CopyOptions} from "../api/copy-options";
import {CopyOperation} from "../api/copy-operation";
import {FileContent} from "../api/file-content";

export class NodeFileService extends S3FileService implements GenericFileService<AnyFile, S3WriteOptions> {

    async sleep(period: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, period));
    }

    async waitForLocalFile(localFile: LocalFile): Promise<void> {
        while (!existsSync(localFile.key)) {
            await this.sleep(100);
        }
    }

    async deleteLocalFile(f: LocalFile): Promise<void> {
        unlinkSync(f.key);
    }

    toEither<T extends S3File, L extends LocalFile>(f: AnyFile): Either<T, L> {
        return this.isS3File(f) ? left(this.toS3File(f)) : right(this.toLocalFile(f));
    }

    async waitForFileToExist(file: AnyFile): Promise<void> {
        return pipe(
            this.toEither(file),
            fold(f => super.waitForFileToExist(f), f => this.waitForLocalFile(f))
        );
    }

    async ensureDirectoryExistence(localFile: LocalFile): Promise<void> {
        const fileInfo = parse(localFile.key);
        await mkdirp(fileInfo.dir);
    }

    directoryExists(dirPath: string) {
        return existsSync(dirPath) && statSync(dirPath).isDirectory();
    }

    async calculateStreamMD5(stream: Readable): Promise<string> {
        const hash = createHash("md5");
        for await (const chunk of stream) {
            hash.update(chunk, "utf8");
        }
        return hash.digest("hex");
    }

    private calculateLocalMD5(file: LocalFile): Promise<string> {
        return this.calculateStreamMD5(createReadStream(file.key));
    }



    async readFile(file: ScannedFile): Promise<FileContent> {
        return pipe(
            this.toEither<ScannedS3File, Scanned<LocalFile>>(file),
            fold(
                f => super.readFile(f),
                async f => readFileSync(file.key)
            )
        )
    }

    scan<T extends LocalFile>(file: T): Promise<Optional<Scanned<T>>> {
        return pipe(
            this.toEither(file),
            fold(
                f => super.scan(f),
                f => this.scanLocalFile(f)
            )
        ) as Promise<Optional<Scanned<T>>>;
    }

    async deleteFile<T extends Scanned<LocalFile>>(file: T): Promise<void> {
        return pipe(
            this.toEither<ScannedS3File, Scanned<LocalFile>>(file),
            fold(f => super.deleteFile(f), f => this.deleteLocalFile(f))
        );
    }

    async scanLocalFile(file: LocalFile): Promise<Optional<Scanned<LocalFile>>> {
        if(existsSync(file.key)) {
            const fileInfo = statSync(file.key);
            if(fileInfo.isFile()) {
                return FpOptional.of({
                    ...file,
                    md5: await this.calculateLocalMD5(file),
                    size: statSync(file.key).size,
                    mimeType: getType(file.key)
                })
            }
        }
        return FpOptional.empty();
    }

    listFilesRecursively(directoryOrFilePath: string): string[] {
        if (existsSync(directoryOrFilePath)) {
            const fileInfo = statSync(directoryOrFilePath);
            if (fileInfo) {
                if (fileInfo.isDirectory()) {
                    const chunks = readdirSync(directoryOrFilePath)
                        .map(f => resolvePath(directoryOrFilePath, f))
                        .map(f => this.listFilesRecursively(f));
                    return flatten(chunks);
                } else if (fileInfo.isFile()) {
                    return [directoryOrFilePath];
                }
            }
        }
        return [];
    }

    list<T extends LocalFile>(fileOrFolder: T): AsyncIterable<Scanned<T>[]> {
        return pipe(
            this.toEither(fileOrFolder),
            fold(
                f => super.list(f),
                f => this.listLocal(f)
            )
        ) as AsyncIterable<Scanned<T>[]>;
    }

    listLocal(file: LocalFile): AsyncIterable<Scanned<LocalFile>[]> {
        throw new Error("Not implemented yet");
    }

    async copy<A extends AnyFile, B extends AnyFile>(request: CopyRequest<A, B>,
                                                     options: CopyOptions<A, B> & S3WriteOptions): Promise<void> {
        return super.copy(request as CopyRequest<S3File, S3File>,
            options as CopyOptions<S3File, S3File> & S3WriteOptions);
    }

    toLocationString(input: AnyFile): string {
        return pipe(
            this.toEither(input),
            fold(
                s3File => super.toLocationString(s3File),
                localFile => localFile.key
            )
        )

    }

    async copyFile<A extends AnyFile, B extends AnyFile>(request: CopyOperation<A, B>,
                                                         options: CopyOptions<A, B> & S3WriteOptions): Promise<void> {

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
                s3ToS3 => super.copyFile(s3ToS3, options as CopyOptions<S3File, S3File>),
                s3ToLocal => this.copyS3ToLocal(s3ToLocal, options as CopyOptions<S3File, LocalFile>),
                localToS3 => this.copyLocalToS3(localToS3, options as CopyOptions<LocalFile, S3File>),
                localToLocal => this.copyLocalToLocal(localToLocal, options as CopyOptions<LocalFile, LocalFile>)
            )
        ) as Promise<void>;

    }


    async copyLocalToS3(request: CopyOperation<LocalFile, S3File>,
                        options: CopyOptions<LocalFile, S3File> & S3WriteOptions): Promise<void> {
        await this.writeFile({
            body: readFileSync(request.source.key),
            destination: request.destination
        }, options);
    }

    async copyS3ToLocal(request: CopyOperation<S3File, LocalFile>,
                  options: CopyOptions<S3File, LocalFile>): Promise<void> {
        await this.ensureDirectoryExistence(request.destination);
        const body = await this.read(request.source);
        writeFileSync(request.destination.key, body);
    }

    async copyLocalToLocal(request: CopyOperation<LocalFile, LocalFile>,
                           options: CopyOptions<LocalFile, LocalFile>): Promise<void> {
        await this.ensureDirectoryExistence(request.destination);
        copyFileSync(request.source.key, request.destination.key);
    }

    isS3File(input: AnyFile): boolean {
        return !!(input as S3File).bucket;
    }

    toLocalPath(s3Key: string): string {
        return s3Key.split("/").join(sep);
    }

    toLocalFile<T extends LocalFile>(file: AnyFile): T {
        return this.isS3File(file) ? file as T : {
            ...file,
            key: normalize(this.toLocalPath(file.key))
        } as T;
    }

    toS3File<T extends S3File>(destination: AnyFile): T {
        return this.isS3File(destination) ? {
            ...destination,
            key: this.toS3Key(destination.key)
        } as T : destination as T;
    }

    replacePathSepsWithForwardSlashes(input: string): string {
        return input.split(sep).join("/");
    }

    stripPrefixSlash(input: string): string {
        return input.startsWith("/") ? input.replace("/", "") : input;
    }

    toS3Key(input: string): string {
        return this.stripPrefixSlash(this.replacePathSepsWithForwardSlashes(input));
    }

}
