import S3, {
    HeadObjectOutput,
    ListObjectsV2Output,
    ListObjectsV2Request,
    PutObjectRequest
} from "aws-sdk/clients/s3";
import {Logger} from "../logger";
import {NoOpLogger} from "../no.op.logger";
import {getType} from "mime";
import {S3CopyRequest} from "./s3-copy-request";
import {AnyFile, S3File, ScannedS3File, WriteOptions} from "../api";
import {defaultCopyOptions} from "./default-copy-options";
import {defaultContentType} from "./default-content-type";
import {ResolveDestinationRequest} from "./resolve-destination-request";
import {S3CopyOperation} from "./s3-copy-operation";

export class S3FileService {

    s3Promise: Promise<S3>;

    /**
     *
     * @param s3 - {S3 | Promise<S3>} Either an s3 object or a promise of one
     * @param [logger] - Optional logger to use
     */
    constructor(s3: S3 | Promise<S3>, readonly logger: Logger = new NoOpLogger()) {
        this.s3Promise = this.toPromise(s3);
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

    protected async collectList(request: ListObjectsV2Request,
                      collector: (response: ListObjectsV2Output) => Promise<void>): Promise<void> {
        const s3 = await this.s3Promise;
        let data = await s3.listObjectsV2(request).promise();
        await collector(data);
        while (data.NextContinuationToken) {
            data = await s3.listObjectsV2({
                ...request,
                ContinuationToken: data.NextContinuationToken
            }).promise();
            await collector(data);
        }
    }

    async listS3Files(file: S3File, delimiter?: string): Promise<ScannedS3File[]> {
        const listRequest = {
            Bucket: file.bucket,
            Prefix: file.key,
            Delimiter: delimiter,
        };
        const items = [];
        await this.collectList(listRequest, async data => {
            items.push(...data.Contents.map(item => this.toScannedS3File(file.bucket, item)));
        });
        return items.filter((item, index, arr) =>
            !item.key.endsWith("/") && !this.isContainingFolder(item, arr));
    }


    protected isContainingFolder(file: ScannedS3File, otherFiles: ScannedS3File[]): boolean {
        const folderPrefix = `${file.key}/`;
        return !!otherFiles.find(f => f.key.startsWith(folderPrefix));
    }

    async writeToS3(body, destination: S3File, options: WriteOptions = {}): Promise<ScannedS3File> {
        const s3Params = {
            ...this.toS3WriteParams(destination, options),
            Body: body,
            ContentType: getType(destination.key) || defaultContentType
        };
        const s3 = await this.s3Promise;
        const request = s3.upload(s3Params);
        if (options.progressListener) {
            request.on("httpUploadProgress", (progressEvent) => {
                options.progressListener(destination, progressEvent.loaded, progressEvent.total);
            });
        }
        await request.promise();
        const completeMessage = `Completed upload to ${this.toLocationString(destination)}`;
        this.logger.debug(completeMessage);
        return this.scanS3File(destination);
    }

    async getReadURL(file: ScannedS3File, expires: number = 60 * 60 * 24): Promise<string> {
        const s3 = await this.s3Promise;
        return s3.getSignedUrlPromise("getObject", {Bucket: file.bucket, Key: file.key, Expires: expires});
    }

    protected headResponseToFileInfo(file: S3File, response: HeadObjectOutput): ScannedS3File {
        return {
            ...file,
            size: response.ContentLength,
            md5: JSON.parse(response.ETag),
            mimeType: response.ContentType
        };
    }

    async scanS3File(file: S3File): Promise<ScannedS3File | undefined> {
        const s3 = await this.s3Promise;
        try {
            const info = await s3.headObject({
                Bucket: file.bucket,
                Key: file.key
            }).promise();
            return this.headResponseToFileInfo(file, info);
        } catch (err) {
            if(err.code !== "NotFound") {
                throw err;
            }
        }

    }

    resolveDestination(request: ResolveDestinationRequest): S3File {
        return {
            bucket: request.destinationFolder.bucket,
            key: request.source.key.replace(request.sourceFolder, request.destinationFolder.key)
        };
    }

    toLocationString(input: AnyFile): string {
        return `${input.bucket || ""}/${input.key}`;
    }

    async isValidS3CopyOperation(request: S3CopyOperation, options: WriteOptions): Promise<boolean> {
        // Skip the operation if it's the same location
        if(this.toLocationString(request.source) === this.toLocationString(request.destination)) {
            return false;
        }
        // Proceed if any destination files will always be overwritten
        if (options.overwrite && !options.skipSame) {
            return true;
        }

        const existingFile = await this.scanS3File(request.destination);

        if (!!existingFile && !options.overwrite) {
            return false;
        }
        const sameContent = !!existingFile && existingFile.md5 === request.source.md5;
        return !(sameContent && options.skipSame);

    }

    async copyS3Object(request: S3CopyOperation, options: WriteOptions): Promise<void> {
        const validOperation = await this.isValidS3CopyOperation(request, options);
        if (validOperation) {
            const s3 = await this.s3Promise;
            await s3.copyObject({
                ...this.toS3WriteParams(request.destination, options),
                CopySource: `${request.source.bucket}/${request.source.key}`,
            }).promise();
        }
    }

    protected toS3WriteParams(destination: S3File, options: WriteOptions): PutObjectRequest {
        return {
            Bucket: destination.bucket,
            Key: destination.key,
            ACL: options.makePublic ? "public-read" : null,
            ...(options.s3Params || {})
        };
    }

    async copyS3Objects(request: S3CopyRequest,
                        options: WriteOptions = defaultCopyOptions):
        Promise<void> {
        const sourceFiles = await this.listS3Files(request.source);
        for (const source of sourceFiles) {
            const destination = await this.resolveDestination({
                sourceFolder: request.source.key,
                source,
                destinationFolder: request.destination
            });
            const copyOperation = {
                source,
                destination
            };
            await this.copyS3Object(copyOperation, options);
        }

    }

    async readS3String(file: S3File): Promise<string> {
        const s3 = await this.s3Promise;
        const data = await s3.getObject({Bucket: file.bucket, Key: file.key}).promise();
        return data.Body.toString();
    }

    async waitForS3File(file: S3File): Promise<ScannedS3File> {
        const s3 = await this.s3Promise;
        await s3.waitFor("objectExists", {Bucket: file.bucket, Key: file.key}).promise();
        return this.scanS3File(file);
    }

}