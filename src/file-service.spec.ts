import {FileService} from "./file-service";
import {basename, join, resolve as resolvePath} from "path";
import S3rver from "s3rver";
import {tmpdir} from "os";
import del from "del";
import S3 from "aws-sdk/clients/s3";
import {AnyFile} from "./any-file";
import {expect} from "chai";
import {mkdtempSync, readFileSync} from "fs";
import {ScannedFile} from "./scanned-file";
import axios from "axios";
import {Credentials} from "aws-sdk";


describe("File Service", function() {

    let s3: S3;
    let instance: FileService;
    let testBucket: string;
    let testFileText: string;
    let testFilePath: string;
    let s3rver: S3rver;
    let testDir: string;


    this.timeout(10000);

    before(async () => {
        testBucket = "foo";
        testFileText = "This is a test file";
        testFilePath = resolvePath(__dirname, "..", "test", "test-file.txt");
        testDir = mkdtempSync(join(tmpdir(), "s3rver-")).toString();
        const hostname = "localhost";
        const port = 4569;
        s3rver = new S3rver({
            port,
            address: hostname,
            silent: true,
            directory: testDir
        });
        await s3rver.run();
        const endpoint = `http://${hostname}:${port}`;
        s3 = new S3({
            credentials: new Credentials("S3RVER", "S3RVER"),
            endpoint,
            sslEnabled: false,
            s3ForcePathStyle: true
        });

        await s3.createBucket({
            Bucket: testBucket
        }).promise();

    });

    beforeEach(async () => {
        instance = new FileService(s3);
    });

    it("Gets a link for a remote file", async () => {
        const resultFile = await instance.write(testFileText, {bucket: testBucket, key: "foo.txt"});
        const link = await instance.getReadURL(resultFile);
        const response = await axios.get(link);
        expect(response.data.toString()).to.equal(testFileText,
            "Didn't receive the expected file content when downloading data from the link")
    });

    it("Writes a local file", async () => {
        await instance.write(testFileText, {key: testFilePath}, {overwrite: true, skipSame: false});
        const fileText = readFileSync(testFilePath).toString();
        expect(fileText).to.equal(testFileText);
    });

    it("Writes an S3 file", async () => {
        const s3Destination = "bar.txt";
        const file = {bucket: testBucket, key: s3Destination};
        await instance.write(testFileText, file, {overwrite: true, skipSame: false})
        const fileObject = await s3.getObject({
            Bucket: file.bucket,
            Key: file.key
        }).promise();
        expect(fileObject.Body.toString()).to.equal(testFileText, "Wrong text found in file");
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

            // Create an S3 'folder'
            await s3.upload({
                Bucket: testBucket,
                Key: `${folderKey}/`,
                Body: "foo"
            }).promise();

            for (const content of testFileContent) {
                const key = `${folderKey}/${content}.txt`;
                await s3.upload({
                    Bucket: testBucket,
                    Body: content,
                    Key: key
                }).promise();
            }
        });

        it("Downloads the content of the S3 folder to a local folder", async () => {

            const allRemoteFiles = await instance.list(remoteFolder);
            await instance.copy(remoteFolder, localFolder);

            const allLocalFiles = await instance.list(localFolder);

            const numberOfDownloadedFiles = allLocalFiles.length;
            expect(numberOfDownloadedFiles).to.be.greaterThan(1, "Should have downloaded more than one file");

            interface FileInfo {
                hash: string;
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
                .map(f => instance.deleteAll(f)));
        });
    });

    after(async () => {

        await s3rver.close();
        await del([testDir], {force: true});

    });

});
