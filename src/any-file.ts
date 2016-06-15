/**
 * Created by djabry on 15/06/2016.
 */
export interface AnyFile {
    bucket?:string; //The S3 bucket of the file or left out if a local file
    key:string; //The path to the local file or the s3 key
}