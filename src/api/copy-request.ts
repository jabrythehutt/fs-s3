import {LocalFile} from "./local-file";

export interface CopyRequest<S extends LocalFile, D extends LocalFile> {
    source: S;
    destination: D;
}