import {AnyFile, ScannedFile} from "../api";

export interface ResolveDestinationRequest {
    source: ScannedFile;
    sourceFolder: string;
    destinationFolder: AnyFile;
}