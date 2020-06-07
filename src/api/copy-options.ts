import {LocalFile} from "./local-file";
import {CopyOperation} from "./copy-operation";
import {ConcurrencyOptions} from "./concurrency-options";
import {WriteOptions} from "./write-options";

export interface CopyOptions<A extends LocalFile, B extends LocalFile> extends ConcurrencyOptions, WriteOptions {
    listener?: (operation: CopyOperation<A, B>) => void;
}