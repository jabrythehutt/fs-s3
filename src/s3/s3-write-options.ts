import {ProgressListener} from "../api";
import {CopyObjectRequest, PutObjectRequest} from "aws-sdk/clients/s3";

export interface S3WriteOptions {
    /**
     * Custom S3 params to include in the write request (if writing to S3)
     */
    s3Params?: Partial<PutObjectRequest> | Partial<CopyObjectRequest>;

    /**
     * Listen to S3 upload progress updates
     */
    progressListener?: ProgressListener;

    /**
     * Make the object public (if writing to S3)
     */
    makePublic?: boolean;
}