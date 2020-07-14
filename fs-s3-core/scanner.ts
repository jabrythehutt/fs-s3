import {FileContent} from "./file-content";
import {ContentInfo} from "./content-info";

export interface Scanner {
    scan(body: FileContent): Promise<ContentInfo>;
}