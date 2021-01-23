import S3, {GetObjectOutput, HeadObjectOutput, ListObjectsV2Output, PutObjectRequest} from "aws-sdk/clients/s3";
import {getType} from "mime";
import {
    CopyOperation,
    CopyOptions,
    FileContent,
    FpOptional,
    Optional,
    OverwriteOptions,
    Scanned,
    WriteRequest
} from "@jabrythehutt/fs-s3-core";
import {defaultContentType} from "./default-content-type";
import {S3WriteOptions} from "./s3-write-options";
import {defaultS3WriteOptions} from "./default-s3-write-options";
import {defaultLinkExpiryPeriod} from "./default-link-expiry-period";
import {S3File} from "./s3-file";
import {AbstractFileService} from "./abstract-file-service";
import {ScannedS3File} from "./scanned-s3-file";
import {toS3LocationString} from "./to-s3-location-string";
import {parseS3File} from "./parse-s3-file";

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


    async writeFile(request: WriteRequest<S3File>,
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

    async copyFile(request: CopyOperation<S3File, S3File>,
                   options: CopyOptions<S3File, S3File> & S3WriteOptions): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.copyObject({
            ...this.toS3WriteParams(request.destination, options),
            CopySource: `${request.source.bucket}/${request.source.key}`,
        }).promise();
    }


    async scan<F extends S3File>(file: F): Promise<Optional<Scanned<F>>> {
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
        return response.Body as FileContent;
    }

    async getReadUrl(file: S3File,
                     expires: number = defaultLinkExpiryPeriod): Promise<Optional<string>> {
        const scannedFile = await this.scan(file);
        if (scannedFile.exists) {
            const link = await this.getReadURLForFile(scannedFile.value, expires);
            return FpOptional.of(link);
        }
        return FpOptional.empty();
    }

    async getReadURLForFile(file: ScannedS3File,
                            expires: number = defaultLinkExpiryPeriod): Promise<string> {
        const s3 = await this.s3Promise;
        return s3.getSignedUrlPromise("getObject", {
            ...this.toS3LocationParams(file),
            Expires: expires
        });
    }

    toLocationString(input: S3File): string {
        return toS3LocationString(input);
    }

    async* list<T extends S3File>(fileOrFolder: T): AsyncIterable<Scanned<T>> {
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

    async waitForFileToExist(file: S3File): Promise<void> {
        const s3 = await this.s3Promise;
        await s3.waitFor("objectExists", this.toS3LocationParams(file)).promise();
    }

    parse<F extends S3File>(fileOrFolder: F): F {
        return parseS3File(fileOrFolder);
    }

    protected async toPromise<T>(input: T | Promise<T>): Promise<T> {
        return input;
    }

    protected toScannedS3File<T extends S3File>(bucket: string, item: S3.Object): Scanned<T> {
        return {
            bucket,
            key: item.Key,
            md5: JSON.parse(item.ETag) as string,
            size: item.Size,
            mimeType: getType(item.Key)
        } as Scanned<T>;
    }

    protected headResponseToFileInfo<F extends S3File>(file: F, response: HeadObjectOutput): Scanned<F> {
        return {
            ...file,
            size: response.ContentLength,
            md5: JSON.parse(response.ETag) as string,
            mimeType: response.ContentType
        };
    }

    protected toS3WriteParams(destination: S3File, options: S3WriteOptions): PutObjectRequest {
        return {
            ...this.toS3LocationParams(destination),
            ACL: options.makePublic ? "public-read" : undefined,
            ...(options.s3Params || {})
        };
    }

    protected async getObject(file: S3File): Promise<GetObjectOutput> {
        const s3 = await this.s3Promise;
        return s3.getObject(this.toS3LocationParams(file)).promise();
    }

    protected toS3LocationParams(file: S3File): { Bucket: string, Key: string } {
        return {Bucket: file.bucket, Key: file.key};
    }

    protected toFiles<T extends S3File>(bucket: string, response: ListObjectsV2Output): Scanned<T>[] {
        return response.Contents
            .filter(o => !o.Key.endsWith("/"))
            .map(o => this.toScannedS3File(bucket, o));
    }

}
