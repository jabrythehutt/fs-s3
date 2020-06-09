import {ConcurrencyOptions} from "./concurrency-options";
import {LocalFile} from "./local-file";
import {Scanned} from "./scanned";

export interface DeleteOptions<T extends LocalFile> extends ConcurrencyOptions {
    listener?: (file: Scanned<T>) => void;
}