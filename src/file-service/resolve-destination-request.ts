import {Scanned, LocalFile, InputRequest} from "../api";

export interface ResolveDestinationRequest<S extends LocalFile, D extends LocalFile> extends InputRequest<Scanned<S>> {
    sourceFolder: string;
    destinationFolder: D;
}