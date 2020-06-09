import {NodeFileService} from "./node-file-service";
import {DirUtils, FileServiceTester, generateTests, LocalS3Server} from "../../test";
import * as S3 from "aws-sdk/clients/s3";
import {LocalFileService} from "./local-file-service";
import {S3FileService} from "../s3";
import {AnyFile, LocalFile, S3File, WriteRequest} from "../api";
import {FileGenerator} from "../../test/file-generator";

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

    describe("S3 tests", () => {
        let s3Folder: S3File;
        beforeEach(async () => {
            s3Folder = {
                bucket: "foo",
                key: ""
            };
            await s3.createBucket({
                Bucket: s3Folder.bucket
            }).promise();
        });
        generateTests("Standard tests", () => s3Folder, () => tester);

        describe("Local tests", () => {
            let localFolder: LocalFile;
            beforeEach(() => {
                localFolder = {
                    key: `${DirUtils.createTempDir()}/`
                };
            });
            generateTests("Standard tests", () => localFolder, () => tester);
            afterEach(() => {
                DirUtils.wipe(localFolder.key);
            });

            describe("Cross-copy tests", () => {
                let fileGenerator: FileGenerator;
                beforeEach(() => {
                    fileGenerator = new FileGenerator();
                });

                it("Copies files from a local to an S3 folder", async () => {
                    const writeRequests = fileGenerator.generateTestFiles(10, localFolder);
                    await Promise.all(writeRequests.map(r => instance.write(r)));
                    await tester.testCopyList({
                        source: localFolder,
                        destination: s3Folder
                    });
                });

                it("Copies files from an S3 folder to a local folder", async () => {
                    const writeRequests = fileGenerator.generateTestFiles(10, s3Folder);
                    await Promise.all(writeRequests.map(r => instance.write(r)));
                    await tester.testCopyList({
                        source: s3Folder,
                        destination: localFolder
                    });
                });
            });
        });
    });


    after(async () => {
        await s3rver.stop();
    });
});