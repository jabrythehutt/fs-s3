import {AnyFile, S3File} from "../api";

export function isS3File(input: AnyFile): boolean {
    return !!(input as S3File).bucket;
}