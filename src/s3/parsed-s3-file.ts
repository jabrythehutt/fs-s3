import {parsedArg} from "../file-service/parsed-arg";
import {parseS3File} from "./parse-s3-file";

export const parsedS3File = parsedArg(parseS3File);