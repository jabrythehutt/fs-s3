import {AnyFile} from "./any-file";

export interface ScannedFile extends AnyFile {

    /**
     * The md5 hash of the file content
     */
    md5: string;

    /**
     * The size of the file in bytes
     */
    size: number;

    /**
     * The type of content stored in the file
     */
    mimeType: string;
}
