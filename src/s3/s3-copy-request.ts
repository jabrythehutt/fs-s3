import {WriteOptions} from "../api";
import {S3File} from "../api";

export interface S3CopyRequest {
    source: S3File;
    destination: S3File;
    options: WriteOptions;
}