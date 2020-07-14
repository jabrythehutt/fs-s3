import {Scanner, FileContent, ContentInfo} from "@jabrythehutt/fs-s3-core";
import {createHash} from "crypto";

export class NodeContentScanner implements Scanner {
    
    async scan(content: FileContent): Promise<ContentInfo> {
        return {
            md5: this.md5(content),
            size: this.size(content)
        };
    }

    md5(input: FileContent): string {
        const hash = createHash("md5");
        hash.update(input.toString());
        return  hash.digest("hex");
    }

    size(input: FileContent): number {
        return Buffer.byteLength(input.toString());
    }
    
}