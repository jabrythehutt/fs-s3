import {CopyOptions, LocalFile} from "@jabrythehutt/fs-s3-core";
import {defaultConcurrencyOptions} from "./default-concurrency-options";
import {defaultWriteOptions} from "./default-write-options";

export const defaultCopyOptions: CopyOptions<LocalFile, LocalFile> = {
    ...defaultConcurrencyOptions,
    ...defaultWriteOptions
};