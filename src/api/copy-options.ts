import {LocalFile} from "./local-file";
import {CopyOperation} from "./copy-operation";
import {ConcurrencyOptions} from "./concurrency-options";

export interface CopyOptions<A extends LocalFile, B extends LocalFile> extends ConcurrencyOptions {
    skipSame?: boolean;
    overwrite?: boolean;
    copyListener?: (operation: CopyOperation<A, B>) => void
}