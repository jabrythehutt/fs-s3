import {LocalFile} from "../src/api";

export const fileSorter = <T extends LocalFile>(f1: T, f2: T): number => f1.key.localeCompare(f2.key);