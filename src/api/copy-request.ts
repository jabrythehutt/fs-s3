import {LocalFile} from "./local-file";
import {CopyOptions} from "./copy-options";

export interface CopyRequest<S extends LocalFile, D extends LocalFile> {
    source: S;
    destination: D;
    options?: CopyOptions<S, D>;
}