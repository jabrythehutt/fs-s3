import {LocalFile} from "./local-file";

export interface S3File extends LocalFile {
    bucket: string;
}