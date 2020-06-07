import {CopyOptions} from "./copy-options";
import {AnyFile} from "./any-file";
import {defaultConcurrencyOptions} from "./default-concurrency-options";
import {defaultWriteOptions} from "./default-write-options";

export const defaultCopyOptions: CopyOptions<AnyFile, AnyFile> = {
    ...defaultConcurrencyOptions,
    ...defaultWriteOptions
};