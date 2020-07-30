import {S3File} from "./s3-file";
import {InMemory} from "./in-memory";
import {Scanner} from "@jabrythehutt/fs-s3-core";
import {S3WriteOptions} from "./s3-write-options";
import {S3FileService} from "./s3-file-service";
import {ScannedS3File} from "@jabrythehutt/fs-s3/scanned-s3-file";

export class MockS3FileService extends InMemory<S3File, S3WriteOptions, S3FileService>(S3FileService) {

    constructor(scanner: Scanner, public urlGenerator: (file: ScannedS3File) => Promise<string> =
        async f => `https://${f.bucket}/${f.key}`) {
        super(scanner);
    }

    async getReadURLForFile(file: ScannedS3File): Promise<string> {
        return this.urlGenerator(file);
    }

} 
