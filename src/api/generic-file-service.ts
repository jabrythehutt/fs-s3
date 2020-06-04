import {LocalFile} from "./local-file";
import {Scanned} from "./scanned";
import {CopyRequest} from "./copy-request";
import {WriteRequest} from "./write-request";
import {FileContent} from "./file-content";
import {DeleteOptions} from "./delete-options";

export interface GenericFileService<T extends LocalFile> {
    list(fileOrFolder: T): Promise<Scanned<T>[]>;
    copy<A extends T, B extends T>(request: CopyRequest<A, B>): Promise<void>;
    delete(fileOrFolder: T, options?: DeleteOptions): Promise<void>;
    write(request: WriteRequest<T>): Promise<Scanned<T>>;
    read(file: T): Promise<FileContent>;
}
