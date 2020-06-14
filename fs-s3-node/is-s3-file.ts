import {AnyFile} from "./any-file";
import {S3File} from "@jabrythehutt/fs-s3";

export function isS3File(input: AnyFile): boolean {
    return !!(input as S3File).bucket;
}