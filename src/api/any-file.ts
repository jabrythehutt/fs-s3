export interface AnyFile {

    /**
     * The S3 bucket containing the file, undefined if it's a local file
     */
    bucket?: string;

    /**
     * The path to the local file or the S3 key
     */
    key: string;
}
