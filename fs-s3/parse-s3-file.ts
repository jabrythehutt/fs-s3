import {S3KeyParser} from "./s3-key-parser";
import {S3File} from "./s3-file";

export function parseS3File<F extends S3File>(input: F): F {
    return {
        ...input,
        key: S3KeyParser.parse(input.key)
    };
}