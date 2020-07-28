import {S3File} from "./s3-file";
import {InMemory} from "./in-memory";
import {Scanner} from "@jabrythehutt/fs-s3-core";
import {S3WriteOptions} from "./s3-write-options";
import {S3FileService} from "./s3-file-service";

export class MockS3FileService extends InMemory<S3File, S3WriteOptions, S3FileService>(S3FileService) {

    constructor(scanner: Scanner) {
        super(scanner);
    }

} 
