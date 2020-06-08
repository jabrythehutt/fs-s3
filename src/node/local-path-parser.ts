import {normalize, sep} from "path";
import {AnyFile, LocalFile} from "../api";

export class LocalPathParser {

    static toLocalPath(s3Key: string): string {
        return normalize(s3Key.split("/").join(sep));
    }

    static toLocalFile(file: AnyFile): LocalFile {
        return {
            ...file,
            key: this.toLocalPath(file.key)
        };
    }

}