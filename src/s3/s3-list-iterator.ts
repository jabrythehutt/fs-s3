import {S3File, ScannedS3File} from "../api";
import S3, {ListObjectsV2Output} from "aws-sdk/clients/s3";
import {getType} from "mime";

export class S3ListIterator implements AsyncIterator<ScannedS3File[]> {

    protected responsePromise: Promise<ListObjectsV2Output> = Promise.resolve({});

    constructor(private s3Promise: Promise<S3>, private folder: S3File) {
    }

    protected async listNext(token?: string): Promise<ListObjectsV2Output> {
        const s3 = await this.s3Promise;
        return s3.listObjectsV2({
            Bucket: this.folder.bucket,
            Prefix: this.folder.key,
            ContinuationToken: token
        }).promise();
    }

    protected toScannedS3File(item: S3.Object): ScannedS3File {
        return {
            bucket: this.folder.bucket,
            key: item.Key,
            md5: JSON.parse(item.ETag),
            size: item.Size,
            mimeType: getType(item.Key)
        };
    }

    protected toFiles(response: ListObjectsV2Output): ScannedS3File[] {
        return response.Contents
            .filter(o => !o.Key.endsWith("/"))
            .map(o => this.toScannedS3File(o));
    }

    protected toIteratorResponse(response: ListObjectsV2Output): IteratorResult<ScannedS3File[]> {
        return {
            done: !response.NextContinuationToken,
            value: this.toFiles(response)
        };
    }

    protected async getNextToken(): Promise<string | undefined> {
        return (await this.responsePromise).NextContinuationToken;
    }

    protected async createNextResponsePromise(): Promise<ListObjectsV2Output> {
        return this.listNext(await this.getNextToken());
    }

    async next(...args: [] | [undefined]): Promise<IteratorResult<ScannedS3File[]>> {
        this.responsePromise = this.createNextResponsePromise();
        return this.toIteratorResponse(await this.responsePromise);
    }


}