import {WriteOptions} from "@jabrythehutt/fs-s3-core/write-options";

export const defaultWriteOptions: Required<WriteOptions> = {
    skipSame: false,
    overwrite: false
};