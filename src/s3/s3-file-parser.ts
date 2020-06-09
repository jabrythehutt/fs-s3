import {S3File} from "../api";
import {sep} from "path";

export class S3FileParser {
    static toS3File(destination: S3File): S3File {
        return {
            ...destination as S3File,
            key: this.toS3Key(destination.key)
        };
    }

    static replacePathSepsWithForwardSlashes(input: string): string {
        return input.split(sep).join("/");
    }

    static stripPrefixSlash(input: string): string {
        return input.startsWith("/") ? input.replace("/", "") : input;
    }

    static toS3Key(input: string): string {
        return this.stripPrefixSlash(this.replacePathSepsWithForwardSlashes(input));
    }
}