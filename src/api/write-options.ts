import {OverwriteOptions} from "./overwrite-options";

export interface WriteOptions extends OverwriteOptions {

    /**
     * Skip writing files with the same md5 hash
     */
    skipSame?: boolean;
}
