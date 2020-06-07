import {ManagedUpload} from "aws-sdk/lib/s3/managed_upload";

export type ProgressListener = (progress: ManagedUpload.Progress) => void;
