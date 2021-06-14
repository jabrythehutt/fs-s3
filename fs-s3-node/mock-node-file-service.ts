import {InMemory, S3WriteOptions, S3FileService} from "@jabrythehutt/fs-s3";
import {AnyFile} from "./any-file";
import {NodeFileService} from "./node-file-service";
import {NodeContentScanner} from "./node-content-scanner";
import {LocalFileService} from "./local-file-service";

export class MockNodeFileService extends InMemory<AnyFile, S3WriteOptions, NodeFileService>(NodeFileService){
    constructor(contentScanner: NodeContentScanner, lfs: LocalFileService, s3fs: S3FileService) {
        super(contentScanner, lfs, s3fs);
    }
}
