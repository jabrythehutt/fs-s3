import {S3WriteOptions} from "./s3-write-options";

export const defaultS3WriteOptions: Required<S3WriteOptions> = {
    s3Params: {},
    makePublic: false,
    progressListener: undefined
}