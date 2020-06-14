import {InputRequest, LocalFile, Scanned} from "@jabrythehutt/fs-s3-core";

export interface ResolveDestinationRequest<S extends LocalFile, D extends LocalFile> extends InputRequest<Scanned<S>> {
    sourceFolder: string;
    destinationFolder: D;
}