import {LocalFile} from "./local-file";
import {S3File} from "./s3-file";

export type AnyFile = LocalFile | S3File;
