import {LocalFile} from "./local-file";
import {FileContent} from "./file-content";
import {OutputRequest} from "./output-request";

export interface WriteRequest<T extends LocalFile> extends OutputRequest<T> {
    body: FileContent;
}