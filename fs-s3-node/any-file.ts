import {LocalFile} from "@jabrythehutt/fs-s3-core";
import {S3File} from "@jabrythehutt/fs-s3";

export type AnyFile = LocalFile | S3File;
