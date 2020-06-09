import {LocalFile, S3File,} from "../api";
import {AbstractFileService, isS3File, PolyFileService} from "../file-service";
import {S3FileService, S3WriteOptions} from "../s3";
import {LocalFileService} from "./local-file-service";

export class NodeFileService extends PolyFileService<LocalFile, S3File, S3WriteOptions> {

    constructor(lFs: LocalFileService, s3Fs: S3FileService) {
        super((f: LocalFile | S3File) => isS3File(f) ? s3Fs as AbstractFileService<LocalFile> : lFs);
    }
}
