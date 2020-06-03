import {WriteOptions} from "../api";

export const defaultCopyOptions: WriteOptions = {
    makePublic: false,
    parallel: false,
    overwrite: false,
    skipSame: true
};