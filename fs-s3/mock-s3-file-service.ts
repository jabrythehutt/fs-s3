import {MemoryFileService} from "./memory-file-service";
import {S3File} from "./s3-file";
import {Scanner} from "@jabrythehutt/fs-s3-core";
import { parseS3File } from "./parse-s3-file";
import { toS3LocationString } from "./to-s3-location-string";

export class MockS3FileService extends MemoryFileService<S3File> {
    
  constructor(scanner: Scanner, pollPeriod: number = 100) {
      super(scanner, pollPeriod);
  }

  parse<F extends S3File>(fileOrFolder: F): F {
    return parseS3File(fileOrFolder);
  }

  toLocationString(f: S3File): string {
      return toS3LocationString(f);
  }

} 