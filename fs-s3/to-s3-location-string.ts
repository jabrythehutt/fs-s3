import {S3File} from "./s3-file";

export function toS3LocationString(input: S3File): string {
    return `s3://${[input.bucket, input.key].join("/")}`;
}