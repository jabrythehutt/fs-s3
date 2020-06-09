import S3, {GetObjectOutput, HeadObjectOutput, ListObjectsV2Output, PutObjectRequest} from "aws-sdk/clients/s3";
import {getType} from "mime";
import {
    CopyOperation,
    CopyOptions,
    FileContent,
    Optional,
    OverwriteOptions,
    S3File,
    Scanned,
    ScannedS3File,
    WriteRequest
} from "../api";
import {defaultContentType} from "./default-content-type";
import {AbstractFileService, FpOptional} from "../file-service";
import {S3WriteOptions} from "./s3-write-options";
import {defaultS3WriteOptions} from "./default-s3-write-options";
import {defaultLinkExpiryPeriod} from "./default-link-expiry-period";
import {parsed} from "../file-service/parsed";
import {parsedS3File} from "./parsed-s3-file";
import {parsedInputRequest} from "../file-service/parsed-input-request";
import {parseS3File} from "./parse-s3-file";
import {parsedOutputRequest} from "../file-service/parsed-output-request";

export class S3FileService extends AbstractFileService<S3File, S3WriteOptions> {

    s3Promise: Promise<S3>;

    /**
     *
     * @param s3 - {S3 | Promise<S3>} Either an s3 object or a promise of one
     * @param maxListItemsPerPage - The maximum number of list items to return in one list page
     */
    constructor(s3: S3 | Promise<S3>, protected maxListItemsPerPage = 1000) {
        super();
        this.s3Promise = this.toPromise(s3);
    }

    @parsed
    async writeFile(
        @parsedOutputRequest(parseS3File) request: WriteRequest<S3File>,
        options: OverwriteOptions & S3WriteOptions): Promise<void> {
        options = {
            ...defaultS3WriteOptions,
            ...options,
        };
        const s3Params = {
            ...this.toS3WriteParams(request.destination, options),
            Body: request.body,
            ContentType: getType(request.destination.key) || defaultContentType
        };
        const s3 = await this.s3Promise;
        const managedUpload = s3.upload(s3Params);
        if (options.progressListener) {
            managedUpload.on("httpUploadProgress", (progressEvent) => {
                options.progressListener(progressEvent);
            });
        }
        await managedUpload.promise();
    }

    @parsed
    async copyFile(
        @parsedInputRequest(parseS3File)
        @parsedOutputRequest(parseS3File) request: CopyOperation<S3File, S3File>,
        options: CopyOptions<S3File, S3File> & S3WriteOptions): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.copyObject({
            ...this.toS3WriteParams(request.destination, options),
            CopySource: `${request.source.bucket}/${request.source.key}`,
        }).promise();
    }


    @parsed
    async scan<F extends S3File>(@parsedS3File file: F): Promise<Optional<Scanned<F>>> {
        const s3 = await this.s3Promise;
        try {
            const info = await s3.headObject(this.toS3LocationParams(file)).promise();
            return FpOptional.of(this.headResponseToFileInfo(file, info));
        } catch (err) {
            if (err.code === "NotFound") {
                return FpOptional.empty();
            }
            throw err;
        }
    }

    @parsed
    async deleteFile(@parsedS3File file: ScannedS3File): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.deleteObject(this.toS3LocationParams(file)).promise();
    }

    @parsed
    async readFile(@parsedS3File file: Scanned<S3File>): Promise<FileContent> {
        const response = await this.getObject(file);
        return response.Body as FileContent;
    }

    protected async toPromise<T>(input: T | Promise<T>): Promise<T> {
        return input;
    }

    protected toScannedS3File<T extends S3File>(bucket: string, item: S3.Object): Scanned<T> {
        return {
            bucket,
            key: item.Key,
            md5: JSON.parse(item.ETag),
            size: item.Size,
            mimeType: getType(item.Key)
        } as Scanned<T>;
    }

    @parsed
    async getReadUrl(@parsedS3File file: S3File,
                     expires: number = defaultLinkExpiryPeriod): Promise<Optional<string>> {
        const scannedFile = await this.scan(file);
        if (scannedFile.exists) {
            const link = await this.getReadURLForFile(scannedFile.value, expires);
            return FpOptional.of(link);
        }
        return FpOptional.empty();
    }

    @parsed
    async getReadURLForFile(@parsedS3File file: ScannedS3File,
                            expires: number = defaultLinkExpiryPeriod): Promise<string> {
        const s3 = await this.s3Promise;
        return s3.getSignedUrlPromise("getObject", {
            ...this.toS3LocationParams(file),
            Expires: expires
        });
    }

    @parsed
    protected headResponseToFileInfo<F extends S3File>(@parsedS3File file: F, response: HeadObjectOutput): Scanned<F> {
        return {
            ...file,
            size: response.ContentLength,
            md5: JSON.parse(response.ETag),
            mimeType: response.ContentType
        };
    }

    @parsed
    toLocationString(@parsedS3File input: S3File): string {
        return `s3://${[input.bucket, input.key].join("/")}`;
    }

    @parsed
    protected toS3WriteParams(@parsedS3File destination: S3File, options: S3WriteOptions): PutObjectRequest {
        return {
            ...this.toS3LocationParams(destination),
            ACL: options.makePublic ? "public-read" : undefined,
            ...(options.s3Params || {})
        };
    }

    @parsed
    protected async getObject(@parsedS3File file: S3File): Promise<GetObjectOutput> {
        const s3 = await this.s3Promise;
        return s3.getObject(this.toS3LocationParams(file)).promise();
    }

    @parsed
    protected toS3LocationParams(@parsedS3File file: S3File): { Bucket: string, Key: string } {
        return {Bucket: file.bucket, Key: file.key};
    }

    protected toFiles<T extends S3File>(bucket: string, response: ListObjectsV2Output): Scanned<T>[] {
        return response.Contents
            .filter(o => !o.Key.endsWith("/"))
            .map(o => this.toScannedS3File(bucket, o));
    }

    @parsed
    async* list<T extends S3File>(@parsedS3File fileOrFolder: T): AsyncIterable<Scanned<T>> {
        const s3 = await this.s3Promise;
        let response: Optional<ListObjectsV2Output> = FpOptional.empty();
        while (!response.exists || !!response.value.NextContinuationToken) {
            const previousResponse = {
                ...response.value
            };
            response = FpOptional.of(await s3.listObjectsV2({
                MaxKeys: this.maxListItemsPerPage,
                ContinuationToken: previousResponse.NextContinuationToken,
                Prefix: fileOrFolder.key,
                Bucket: fileOrFolder.bucket
            }).promise());
            const files = this.toFiles<T>(fileOrFolder.bucket, response.value);
            for (const file of files) {
                yield file;
            }
        }
    }

    @parsed
    async waitForFileToExist(@parsedS3File file: S3File): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.waitFor("objectExists", this.toS3LocationParams(file)).promise();
    }

}