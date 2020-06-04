import {LocalFile} from "./local-file";
import {FileContent} from "./file-content";

export interface WriteRequest<T extends LocalFile> {
    body: FileContent;
    file: T;
}