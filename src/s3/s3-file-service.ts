import S3, {
    GetObjectOutput,
    GetObjectRequest,
    HeadObjectOutput, ListObjectsV2Output,
    PutObjectRequest
} from "aws-sdk/clients/s3";
import {getType} from "mime";
import {S3File, Scanned, ScannedS3File} from "../api";
import {defaultContentType} from "./default-content-type";
import {AbstractFileService} from "../api/abstract-file-service";
import {CopyOperation} from "../api/copy-operation";
import {WriteRequest} from "../api/write-request";
import {FileContent} from "../api/file-content";
import {CopyOptions} from "../api/copy-options";
import {S3ListIterator} from "./s3-list-iterator";
import {Optional} from "../api/optional";
import {FpOptional} from "../api/fp.optional";
import {S3WriteOptions} from "./s3-write-options";
import {OverwriteOptions} from "../api/overwrite-options";
import {defaultS3WriteOptions} from "./default-s3-write-options";

export class S3FileService extends AbstractFileService<S3File, S3WriteOptions> {

    s3Promise: Promise<S3>;

    /**
     *
     * @param s3 - {S3 | Promise<S3>} Either an s3 object or a promise of one
     */
    constructor(s3: S3 | Promise<S3>) {
        super();
        this.s3Promise = this.toPromise(s3);
    }

    async writeFile(request: WriteRequest<S3File>, options: OverwriteOptions & S3WriteOptions): Promise<void> {
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
                options.progressListener(request.destination, progressEvent.loaded, progressEvent.total);
            });
        }
        await managedUpload.promise();
    }

    async copyFile(request: CopyOperation<S3File, S3File>,
                   options: CopyOptions<S3File, S3File> & S3WriteOptions): Promise<void> {
        options = {
            ...defaultS3WriteOptions,
            ...options
        };
        const s3 = await this.s3Promise;
        await s3.copyObject({
            ...this.toS3WriteParams(request.destination, options),
            CopySource: `${request.source.bucket}/${request.source.key}`,
        }).promise();
    }

    async scan(file: S3File): Promise<Optional<ScannedS3File>> {
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

    async deleteFile(file: ScannedS3File): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.deleteObject(this.toS3LocationParams(file)).promise();
    }

    async readFile(file: Scanned<S3File>): Promise<FileContent> {
        const response = await this.getObject(file);
        return response.Body;
    }

    async toPromise<T>(input: T | Promise<T>): Promise<T> {
        return input;
    }

    protected toScannedS3File(bucket: string, item: S3.Object): ScannedS3File {
        return {
            bucket,
            key: item.Key,
            md5: JSON.parse(item.ETag),
            size: item.Size,
            mimeType: getType(item.Key)
        };
    }

    async getReadURL(file: ScannedS3File, expires: number = 60 * 60 * 24): Promise<string> {
        const s3 = await this.s3Promise;
        return s3.getSignedUrlPromise("getObject", {
            ...this.toS3LocationParams(file),
            Expires: expires
        });
    }

    protected headResponseToFileInfo(file: S3File, response: HeadObjectOutput): ScannedS3File {
        return {
            ...file,
            size: response.ContentLength,
            md5: JSON.parse(response.ETag),
            mimeType: response.ContentType
        };
    }

    toLocationString(input: S3File): string {
        return `s3://${[input.bucket, input.key].join("/")}`;
    }

    protected toS3WriteParams(destination: S3File, options: S3WriteOptions): PutObjectRequest {
        return {
            ...this.toS3LocationParams(destination),
            ACL: options.makePublic ? "public-read" : undefined,
            ...(options.s3Params || {})
        };
    }

    protected toGetObjectRequest(file: S3File): GetObjectRequest {
        return {Bucket: file.bucket, Key: file.key};
    }

    async getObject(file: S3File): Promise<GetObjectOutput> {
        const s3 = await this.s3Promise;
        return s3.getObject(this.toS3LocationParams(file)).promise();
    }

    protected toS3LocationParams(file: S3File): { Bucket: string, Key: string } {
        return {Bucket: file.bucket, Key: file.key};
    }

    protected toFiles(bucket: string, response: ListObjectsV2Output): ScannedS3File[] {
        return response.Contents
            .filter(o => !o.Key.endsWith("/"))
            .map(o => this.toScannedS3File(bucket, o));
    }

    async *list(fileOrFolder: S3File): AsyncIterable<ScannedS3File[]> {
        const s3 = await this.s3Promise;
        let response: Optional<ListObjectsV2Output> = FpOptional.empty();
        while (!response.exists || !!response.value.NextContinuationToken) {
            const previousResponse = {
                ...response.value
            };
            response = FpOptional.of(await s3.listObjectsV2({
                ContinuationToken: previousResponse.NextContinuationToken,
                ...this.toS3LocationParams(fileOrFolder),
            }).promise());
            yield this.toFiles(fileOrFolder.bucket, response.value);
        }
    }

    async waitForFileToExist(file: S3File): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.waitFor("objectExists", this.toS3LocationParams(file)).promise();
    }

}