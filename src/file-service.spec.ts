import {FileService} from "./file-service";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {basename, join, resolve as resolvePath} from "path";
import * as S3rver from "s3rver";
import {tmpdir} from "os";
import * as del from "del";
import * as S3 from "aws-sdk/clients/s3";
import {AnyFile} from "./any-file";
import {expect} from "chai";
import {mkdtempSync} from "fs";
import {ScannedFile} from "./scanned-file";

let s3: S3;
let fileService: FileService;
const testBucket = "foo";
const testFileText = "This is a test file";
const testFilePath = resolvePath(__dirname, "..", "test", "test-file.txt");
let s3rver;
const testDir = resolvePath(tmpdir(), `s3rver${new Date().getTime()}`);

describe("File Service", function() {
    this.timeout(10000);

    before(async () => {
        await new Promise((resolve, reject) => {

            s3rver = new S3rver({
                port: 4569,
                hostname: "localhost",
                silent: false,
                directory: testDir
            }).run((err, host, port) => {
                const endpoint = `http://${host}:${port}`;

                s3 = new S3({
                    accessKeyId: "foo",
                    secretAccessKey: "bar",
                    endpoint,
                    sslEnabled: false,
                    s3ForcePathStyle: true
                });
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });

        await s3.createBucket({
            Bucket: testBucket
        }).promise();

    });

    beforeEach(async () => {

        fileService = new FileService(s3);
    });

    it("Should get a link for a remote file", done => {
        fileService.write(testFileText,
            {bucket: testBucket, key: "foo.txt"},
            {overwrite: true, skipSame: false}).then((resultFile) => {

            fileService.getReadURL(resultFile).then(link => {

                assert(link, "No link returned for file");

                done();
            });

        });
    });

    it("Should write a local file", (done) => {

        fileService.write(testFileText, {key: testFilePath}, {overwrite: true, skipSame: false}).then(() => {

            // Read the local file to see if it's actually been written
            const fileText = fs.readFileSync(path.resolve(testFilePath)).toString();

            assert(fileText === testFileText, "Wrong text found in file");

            done();
        }, err => {

            assert(!err, err);
            done(err);
        });
    });

    it("Should write an S3 file", (done) => {
        const s3Destination = "bar.txt";
        fileService.write(testFileText, {bucket: testBucket, key: s3Destination}, {overwrite: true, skipSame: false})
            .then(() => {

                s3.getObject({Key: s3Destination, Bucket: testBucket}).promise().then(fileObject => {

                    assert(fileObject.Body.toString() === testFileText, "Wrong text found in file");

                    done();
                });

            }, err => {

                assert(!err, err);
                done(err);
            });

    });

    describe("An S3 folder containing some files", () => {

        let remoteFolder: AnyFile;
        let localFolder: AnyFile;

        beforeEach("Write some test files to the S3 folder", async () => {
            const folderKey = "test-folder-foo/bar/baz";
            const localFolderKey = mkdtempSync(join(tmpdir(), "fss3-test-")).toString();
            const testFileContent = [
                "foo",
                "bar",
                "baz"
            ];

            localFolder = {
                key: localFolderKey
            };

            remoteFolder = {
                bucket: testBucket,
                key: folderKey
            };

            for (const content of testFileContent) {
                const destination = {
                    key: `${folderKey}/${content}.txt`,
                    bucket: testBucket
                }
                await fileService.write(content, destination);
            }
        });

        it("Downloads the content of the S3 folder to a local folder", async () => {

            await fileService.copy(remoteFolder, localFolder);

            const allRemoteFiles = await fileService.list(remoteFolder);
            const allLocalFiles = await fileService.list(localFolder);

            const numberOfDownloadedFiles = allLocalFiles.length;
            expect(numberOfDownloadedFiles).to.be.greaterThan(1, "Should have downloaded more than one file");

            interface FileInfo {
                hash: string,
                size: number;
                fileName: string;
            }
            const toFileInfo = (f: ScannedFile): FileInfo => ({
                hash: f.md5,
                size: f.size,
                fileName: basename(f.key)
            });

            const fileInfoComparator = (a: FileInfo, b: FileInfo) => a.hash.localeCompare(b.hash);
            const remoteFileInfo = allRemoteFiles.map(toFileInfo).sort(fileInfoComparator);
            const downloadedFileInfo = allLocalFiles.map(toFileInfo).sort(fileInfoComparator);
            expect(remoteFileInfo).to.deep.equal(downloadedFileInfo,
                "The downloaded files need to have the same names and content")
        });

        afterEach("Remove the test files", async () => {
            await Promise.all([localFolder, remoteFolder]
                .map(f => fileService.deleteAll(f)));
        });
    });

    after(async () => {

        await new Promise((resolve, reject) => {
            s3rver.close(err => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });

        await del([testDir], {force: true});

    });

});
