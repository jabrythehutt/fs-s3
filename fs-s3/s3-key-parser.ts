import {sep} from "path";

export class S3KeyParser {
    static replacePathSepsWithForwardSlashes(input: string): string {
        return input.split(sep).join("/");
    }

    static stripPrefixSlash(input: string): string {
        return input.startsWith("/") ? input.replace("/", "") : input;
    }

    static parse(input: string): string {
        return this.stripPrefixSlash(this.replacePathSepsWithForwardSlashes(input));
    }
}