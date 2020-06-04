import {LocalFile} from "./local-file";
import {Scanned} from "./scanned";
import {CopyRequest} from "./copy-request";
import {WriteRequest} from "./write-request";
import {FileContent} from "./file-content";
import {CopyOptions} from "./copy-options";

export interface GenericFileService<T extends LocalFile, O extends CopyOptions> {
    list(folder: T): Promise<Scanned<T>[]>;
    copy<A extends T, B extends T>(request: CopyRequest<A, B, O>): Promise<Scanned<B>>;
    delete(fileOrFolder: T): Promise<Scanned<T>[]>;
    write(request: WriteRequest<T>): Promise<Scanned<T>>;
    read(file: T): Promise<FileContent>;
}
