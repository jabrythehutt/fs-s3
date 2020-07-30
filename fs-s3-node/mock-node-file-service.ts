import {InMemory, S3WriteOptions} from "@jabrythehutt/fs-s3";
import {AnyFile} from "./any-file";
import {NodeFileService} from "@jabrythehutt/fs-s3-node/node-file-service";

export class MockNodeFileService extends InMemory<AnyFile, S3WriteOptions, NodeFileService>(NodeFileService){

}
