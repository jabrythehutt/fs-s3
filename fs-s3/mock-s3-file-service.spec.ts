import {MockS3FileService} from "./mock-s3-file-service";
import {FileServiceTester, generateTests} from "../test";
import {S3File} from "./s3-file";
import {NodeContentScanner} from "@jabrythehutt/fs-s3-node";

describe("Mock S3 file service", () => {
    let tester: FileServiceTester<S3File>;
    let instance: MockS3FileService;
    let originalTimeout: number;

    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
        const contentScanner = new NodeContentScanner();
        instance = new MockS3FileService(contentScanner);
        tester = new FileServiceTester<S3File>(instance, contentScanner);
    });

    generateTests("Standard tests", () => ({key: "", bucket: "foo"}), () => tester);

    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });
});