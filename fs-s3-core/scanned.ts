import {ContentInfo} from "./content-info";

export type Scanned<T> = T & ContentInfo & {
   
    /**
     * The type of content stored in the file
     */
    mimeType: string;
}