import {LocalFile} from "./local-file";
import {Scanned} from "./scanned";
import {CopyRequest} from "./copy-request";
import {CopyOptions} from "./copy-options";
import {Optional} from "./optional";
import {OverwriteOptions} from "./overwrite-options";
import {DeleteOptions} from "./delete-options";
import {WriteRequest} from "./write-request";
import {FileContent} from "./file-content";

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
    parse<F extends T>(file: F): F;
}
