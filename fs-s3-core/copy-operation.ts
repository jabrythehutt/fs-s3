import {Scanned} from "./scanned";
import {LocalFile} from "./local-file";

export interface CopyOperation<S extends LocalFile, D extends LocalFile> {
    source: Scanned<S>;
    destination: D;
}