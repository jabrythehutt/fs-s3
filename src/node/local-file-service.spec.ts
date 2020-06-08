import {LocalFileService} from "./local-file-service";
import {DirUtils, FileServiceTester} from "../../test";
import {LocalFile} from "../api";
import {resolve} from "path";

describe("Local file service", () => {
    let instance: LocalFileService;
    let tester: FileServiceTester<LocalFile, {}>;
    let tempDir: string;

    beforeEach(() => {
        instance = new LocalFileService();
        tester = new FileServiceTester<LocalFile, {}>(instance);
        tempDir = DirUtils.createTempDir();
    });

    describe("Individual file operations", () => {
        const fileContent = "foobar";
        let file: LocalFile;
        beforeEach(async () => {
            file = {
                key: resolve(tempDir, "foo.txt")
            };
        });

        it("Writes and reads a file", async () => {
            await tester.testWriteRead({destination: file, body: fileContent}, {});
        });
    });

    afterEach(() => {
        DirUtils.wipe(tempDir);
    });
});