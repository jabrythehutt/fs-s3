import {ProgressListener} from "./progress-listener";
/**
 * Created by djabry on 15/06/2016.
 */

export interface WriteOptions {
    skipSame?: boolean; // Skip writing files with the same md5 hash
    overwrite?: boolean; // Overwrite files with the same key/path
    parallel?: boolean; // Perform multiple write operations in parallel
    makePublic?: boolean; // Make the object public (if writing to S3)
    progressListener?: ProgressListener;
    s3Params?: { [key: string]: any }; // Custom s3 params to include in the write request (if writing to s3)
}
