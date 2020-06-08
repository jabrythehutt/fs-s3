import {AnyFile, LocalFile} from "../api";

export type PathParser<T extends LocalFile> = (file: T) => T;