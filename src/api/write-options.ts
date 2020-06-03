import {ProgressListener} from "./progress-listener";
import {CopyObjectRequest, PutObjectRequest} from "aws-sdk/clients/s3";


export interface WriteOptions {
    /**
     * Skip writing files with the same md5 hash
     */
    skipSame?: boolean;

    /**
     * Overwrite files with the same key/path
     */
    overwrite?: boolean;

    /**
     * Perform multiple write operations in parallel
     */
    parallel?: boolean;

    /**
     * Make the object public (if writing to S3)
     */
    makePublic?: boolean;

    /**
     * Listen to S3 upload progress updates
     */
    progressListener?: ProgressListener;

    /**
     * Custom S3 params to include in the write request (if writing to S3)
     */
    s3Params?: Partial<PutObjectRequest> | Partial<CopyObjectRequest>;
}
