import {LocalFile} from "./local-file";
import {Scanned} from "./scanned";

export interface ResolveDestinationRequest<S extends LocalFile, D extends LocalFile> {
    source: Scanned<S>;
    sourceFolder: string;
    destinationFolder: D;
}