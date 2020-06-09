import {mkdtempSync} from "fs";
import {join} from "path";
import {tmpdir} from "os";
import del from "del";

export class DirUtils {
    static createTempDir(prefix = "fss3-test-"): string {
        return mkdtempSync(join(tmpdir(), prefix)).toString();
    }

    static async wipe(dir: string): Promise<void> {
        await del([dir], {force: true});
    }
}