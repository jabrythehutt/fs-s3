import {AnyFile} from "./any-file";
/**
 * Created by djabry on 15/06/2016.
 */
export interface ScannedFile extends AnyFile {
    md5:string; //The md5 hash of the file content
    size:number; //The size of the file in bytes
    mimeType:string; //The mime type of the file
}