import {LocalFileService} from "./local-file-service";
import {DirUtils, FileServiceTester, generateTests} from "../test";
import {LocalFile} from "@jabrythehutt/fs-s3-core";
import { NodeContentScanner } from "./node-content-scanner";

describe("Local file service", () => {
    let tester: FileServiceTester<LocalFile>;
    let tempDir: string;
    let instance: LocalFileService;
    let originalTimeout: number;

    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000
        tempDir = DirUtils.createTempDir();
        instance = new LocalFileService();
        const contentScanner = new NodeContentScanner();
        tester = new FileServiceTester<LocalFile>(instance, contentScanner);
    });

    generateTests("Standard tests", () => ({key: `${tempDir}/`}), () => tester);

    afterEach(() => {
        DirUtils.wipe(tempDir);
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });
});