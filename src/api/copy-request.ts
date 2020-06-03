import {WriteOptions} from "./write-options";

export interface CopyRequest<T> {
    source: T;
    destination: T;
    options: WriteOptions;
}