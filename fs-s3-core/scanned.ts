export type Scanned<T> = T & {
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