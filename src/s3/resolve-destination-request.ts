import {LocalFile} from "../api/local-file";
import {Scanned} from "../api/scanned";

export interface ResolveDestinationRequest<S extends LocalFile, D extends LocalFile> {
    source: Scanned<S>;
    sourceFolder: string;
    destinationFolder: D;
}