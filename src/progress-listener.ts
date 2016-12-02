import {AnyFile} from "./any-file";
/**
 * Created by djabry on 02/12/2016.
 */
export type ProgressListener = (destination: AnyFile, current: number, total: number) =>  void;