import {S3File, ScannedS3File} from "../api";

export interface S3CopyOperation {
    source: ScannedS3File;
    destination: S3File;
}