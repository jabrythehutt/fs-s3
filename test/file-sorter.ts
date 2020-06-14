import {LocalFile} from "@jabrythehutt/fs-s3-core";

export const fileSorter = <T extends LocalFile>(f1: T, f2: T): number => f1.key.localeCompare(f2.key);