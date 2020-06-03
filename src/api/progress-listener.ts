import {AnyFile} from "./any-file";

export type ProgressListener = (destination: AnyFile, current: number, total: number) =>  void;
