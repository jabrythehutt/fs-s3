import {LocalFile} from "@jabrythehutt/fs-s3-core";
import {AbstractFileService, PolyFileService, S3File, S3FileService, S3WriteOptions} from "@jabrythehutt/fs-s3";
import {LocalFileService} from "./local-file-service";
import {isS3File} from "./is-s3-file";

export class NodeFileService extends PolyFileService<LocalFile, S3File, S3WriteOptions> {

    constructor(lFs: LocalFileService, s3Fs: S3FileService) {
        super((f: LocalFile | S3File) => isS3File(f) ? s3Fs as AbstractFileService<LocalFile> : lFs);
    }
}
