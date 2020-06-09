import {
    CopyOptions,
    CopyRequest,
    DeleteOptions,
    FileContent,
    LocalFile,
    Optional,
    OverwriteOptions,
    Scanned,
    WriteRequest
} from "../api";

export interface GenericFileService<T extends LocalFile, W = unknown> {
    list<F extends T = T>(fileOrFolder: F): AsyncIterable<Scanned<F>>;
    copy<A extends T = T, B extends T = T>(request: CopyRequest<A, B>, options?: CopyOptions<A, B> & W): Promise<void>;
    delete(fileOrFolder: T, options?: DeleteOptions<T>): Promise<void>;
    write<F extends T = T>(request: WriteRequest<F>, options?: OverwriteOptions & W): Promise<Optional<Scanned<F>>>;
    scan<F extends T = T>(file: F): Promise<Optional<Scanned<F>>>;
    read(file: T): Promise<Optional<FileContent>>;
    readFile(file: Scanned<T>): Promise<FileContent>;
    waitForFile<F extends T = T>(file: F): Promise<Scanned<F>>;
    toLocationString(file: T): string;
}
