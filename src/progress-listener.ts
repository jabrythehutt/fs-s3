import {AnyFile} from "./any-file";
/**
 * Created by djabry on 02/12/2016.
 */
export interface ProgressListener {
    progress(destination: AnyFile, current: number, total: number): void;
}