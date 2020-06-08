import {CopyOptions, CopyRequest, DeleteOptions, FileContent, LocalFile, Optional, Scanned, WriteRequest} from "../api";
import {OverwriteOptions} from "../api/overwrite-options";

export interface GenericFileService<T extends LocalFile, W = {}> {
    list(fileOrFolder: T): AsyncIterable<Scanned<T>[]>;
    copy<A extends T, B extends T>(request: CopyRequest<A, B>, options?: CopyOptions<A, B> & W): Promise<void>;
    delete(fileOrFolder: T, options?: DeleteOptions<T>): Promise<void>;
    write(request: WriteRequest<T>, options?: OverwriteOptions & W): Promise<Optional<Scanned<T>>>;
    scan(file: T): Promise<Optional<Scanned<T>>>;
    read(file: T): Promise<Optional<FileContent>>;
    readFile(file: Scanned<T>): Promise<FileContent>;
    waitForFile(file: T): Promise<Scanned<T>>;
    toLocationString(file: T): string;
}
