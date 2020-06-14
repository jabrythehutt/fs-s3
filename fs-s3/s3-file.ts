import {LocalFile} from "@jabrythehutt/fs-s3-core";

export interface S3File extends LocalFile {
    bucket: string;
}