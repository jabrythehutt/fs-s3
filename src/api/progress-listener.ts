import {LocalFile} from "./local-file";

export type ProgressListener<T extends LocalFile> = (destination: T, current: number, total: number) =>  void;
