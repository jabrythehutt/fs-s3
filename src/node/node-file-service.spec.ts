import {NodeFileService} from "./node-file-service";
import {DirUtils, FileGenerator, FileServiceTester, generateTests, LocalS3Server} from "../../test";
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
    let fileGenerator: FileGenerator<LocalFile>;

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
        fileGenerator = new FileGenerator(instance);
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

                async function writeSomeFilesTo<T extends LocalFile>(folder: T): Promise<void> {
                    const writeRequests = fileGenerator.generateTestFiles(10, folder);
                    await Promise.all(writeRequests.map(r => instance.write(r)));
                }

                it("Copies files between the local file system and S3", async () => {
                    for(const folders of fileGenerator.permutations([s3Folder, localFolder])) {
                        const [source, destination] = folders;
                        await writeSomeFilesTo(source);
                        await tester.testCopyList({
                            source,
                            destination
                        });
                        await Promise.all(folders.map(f => tester.fileService.delete(f)));
                    }
                });
            });
        });
    });


    after(async () => {
        await s3rver.stop();
    });
});