import {Scanned, LocalFile} from "../api";

export interface ResolveDestinationRequest<S extends LocalFile, D extends LocalFile> {
    source: Scanned<S>;
    sourceFolder: string;
    destinationFolder: D;
}