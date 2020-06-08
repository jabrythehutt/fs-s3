import {LocalFile} from "../api";

export type ArgMapper<T extends LocalFile> = (arg) => T[];