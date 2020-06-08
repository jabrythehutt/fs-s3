import {NodeFileService} from "./node-file-service";
import {DirUtils, FileServiceTester, generateTests, LocalS3Server} from "../../test";
import * as S3 from "aws-sdk/clients/s3";
import {LocalFileService} from "./local-file-service";
import {S3FileService} from "../s3";
import {AnyFile, LocalFile, S3File} from "../api";

describe("Node file service", function() {

    this.timeout(10000);

    let instance: NodeFileService;
    let s3: S3;
    let s3rver: LocalS3Server;
    let tester: FileServiceTester<AnyFile, AnyFile>;

    before(async () => {
        s3rver = new LocalS3Server();
        await s3rver.start();
    });

    beforeEach(async () => {
        s3rver.reset();
        s3 = s3rver.createClient();
        const localFileService = new LocalFileService();
        const s3FileService = new S3FileService(s3);
        instance = new NodeFileService(localFileService, s3FileService);
        tester = new FileServiceTester<AnyFile, AnyFile>(instance);
    });

    describe("S3-only tests", () => {
        let folder: S3File;
        beforeEach(async () => {
            folder = {
                bucket: "foo",
                key: ""
            };
            await s3.createBucket({
                Bucket: folder.bucket
            }).promise();
        });
        generateTests("Standard tests", () => folder, () => tester);
    });

    describe("Local-only tests", () => {
        let folder: LocalFile;
        beforeEach(() => {
            folder = {
                key: DirUtils.createTempDir()
            };
        });
        generateTests("Standard tests", () => folder, () => tester);
        afterEach(() => {
            DirUtils.wipe(folder.key);
        });
    });


    after(async () => {
        await s3rver.stop();
    });
});