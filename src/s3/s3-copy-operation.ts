import {S3File} from "../api";
import {CopyOperation} from "../api/copy-operation";

export type S3CopyOperation = CopyOperation<S3File, S3File>;