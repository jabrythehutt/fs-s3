import {InMemory} from "@jabrythehutt/fs-s3";
import {LocalFile} from "@jabrythehutt/fs-s3-core";
import {LocalFileService} from "./local-file-service";

export class MockLocalFileService extends InMemory<LocalFile, unknown, LocalFileService>(LocalFileService){

}
