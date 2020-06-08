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
                    key: DirUtils.createTempDir()
                };
            });
            generateTests("Standard tests", () => localFolder, () => tester);
            afterEach(() => {
                DirUtils.wipe(localFolder.key);
            });

            describe("Cross-copy tests", () => {
                let localWriteRequest: WriteRequest<LocalFile>;
                let s3WriteRequest: WriteRequest<S3File>;
                beforeEach(() => {
                    const fileGenerator = new FileGenerator();
                    [localWriteRequest] = fileGenerator.generateTestFiles(1, localFolder);
                    [s3WriteRequest] = fileGenerator.generateTestFiles(1, s3Folder);
                });

                it("Copies a file from a local to an S3 folder", async () => {
                    await instance.write(localWriteRequest);
                    await tester.testCopyList({
                        source: localWriteRequest.destination,
                        destination: s3WriteRequest.destination
                    });
                });

                it("Copies a file from an S3 folder to a local folder", async () => {
                    await instance.write(s3WriteRequest);
                    await tester.testCopyList({
                        source: s3WriteRequest.destination,
                        destination: localWriteRequest.destination
                    });
                });
            });
        });
    });


    after(async () => {
        await s3rver.stop();
    });
});