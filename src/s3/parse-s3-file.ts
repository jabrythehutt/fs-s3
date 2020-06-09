import {S3FileParser} from "./s3-file-parser";
import {S3File} from "../api";

export const parseS3File = (f: S3File) => S3FileParser.toS3File(f);
