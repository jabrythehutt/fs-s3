import {LocalFileService} from "./local-file-service";
import {DirUtils, FileServiceTester, generateTests} from "../../test";
import {LocalFile} from "../api";

describe("Local file service", () => {
    let tester: FileServiceTester<LocalFile>;
    let tempDir: string;
    let instance: LocalFileService;

    beforeEach(() => {
        tempDir = DirUtils.createTempDir();
        instance = new LocalFileService();
        tester = new FileServiceTester<LocalFile>(instance);
    });

    generateTests("Standard tests", () => ({key: `${tempDir}/`}), () => tester);

    afterEach(() => {
        DirUtils.wipe(tempDir);
    });
});