import {FileService} from "./file-service";
import {basename, join, resolve as resolvePath} from "path";
import S3rver from "s3rver";
import {tmpdir} from "os";
import del from "del";
import S3 from "aws-sdk/clients/s3";
import {AnyFile} from "./any-file";
import {expect, use} from "chai";
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from "fs";
import {ScannedFile} from "./scanned-file";
import axios from "axios";
import {Credentials} from "aws-sdk";
import chaiAsPromised from "chai-as-promised";
import {FsError} from "./fs.error";

function createTempDir(): string {
    return mkdtempSync(join(tmpdir(), "fss3-test-")).toString();
}

async function wipeLocalFolder(localPath: string): Promise<void> {
    await del([localPath], {force: true});
}

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
const fileInfoComparator = (a: FileInfo, b: FileInfo): number => a.hash.localeCompare(b.hash);

describe("File Service", function() {

    let s3: S3;
    let instance: FileService;
    let testBucket: string;
    let s3rver: S3rver;
    let localS3Dir: string;
    let localTestDir: string;

    this.timeout(10000);

    before(async () => {
        use(chaiAsPromised);
        testBucket = "foo";
        localS3Dir = createTempDir();
    });

    before(async () => {
        const port = 4569;
        const hostname = "localhost";
        s3rver = new S3rver({
            port,
            address: hostname,
            silent: true,
            directory: localS3Dir
        });
        await s3rver.run();
        const endpoint = `http://${hostname}:${port}`;
        s3 = new S3({
            credentials: new Credentials("S3RVER", "S3RVER"),
            endpoint,
            sslEnabled: false,
            s3ForcePathStyle: true
        });
    });

    beforeEach(async () => {
        (s3rver as any).reset();
        await s3.createBucket({
            Bucket: testBucket
        }).promise();

        localTestDir = createTempDir();
        instance = new FileService(s3);
    });

    describe("Links", () => {
        const fileName = "foo.txt"
        const text = "foobar";

        it("Gets a link for a remote file", async () => {
            const resultFile = await instance.write(text, {bucket: testBucket, key: fileName});
            const link = await instance.getReadURL(resultFile);
            const response = await axios.get(link);
            expect(response.data.toString()).to.equal(text,
                "Didn't receive the expected file content when downloading data from the link")
        });

        it("Throws an error when trying to get a link for a local file", async () => {
            const localFilePath = join(localTestDir, fileName);
            const localFile = await instance.write("foobar", {key: localFilePath});
            await expect(instance.getReadURL(localFile)).to.eventually.be.rejectedWith(FsError.LocalLink);
        });

    });



    describe("Writing files", () => {

        const text = "baz";
        const fileName = "bar.txt";

        it("Writes a local file", async () => {
            const testFilePath = join(localTestDir, fileName);
            await instance.write(text, {key: testFilePath});
            const fileText = readFileSync(testFilePath).toString();
            expect(fileText).to.equal(text);
        });

        it("Writes an S3 file", async () => {
            const file = {bucket: testBucket, key: fileName};
            await instance.write(text, file);
            const fileObject = await s3.getObject({
                Bucket: file.bucket,
                Key: file.key
            }).promise();
            expect(fileObject.Body.toString()).to.equal(text, "Wrong text found in file");
        });

        it("Assumes that users wish to place objects with a '/' prefix at the root of the bucket", async () => {
            const writtenFile = await instance.write(text, {bucket: testBucket, key: `/${fileName}`});
            expect(writtenFile.key).to.equal(fileName);
        });
    });

    describe("Overwrite behaviour", () => {
        let s3File: ScannedFile;
        let localFile: ScannedFile;
        let newText: string;

        beforeEach(async () => {
            s3File = await instance.write("foo bar", {bucket: testBucket, key: "foo.txt"});
            localFile = await instance.write("bar baz", {key: join(localTestDir, "bar.txt")});
            newText = "foo bar baz";
        });

        it("Overwrites an existing S3 object when the overwrite flag is true", async () => {
            await instance.write(newText, s3File, {overwrite: true});
            const writtenContent = await instance.readString(s3File);
            expect(writtenContent).to.equal(newText);
        });

        it("Overwrites an existing local file when the overwrite flag is true", async () => {
            await instance.write(newText, localFile, {overwrite: true});
            const writtenContent = await instance.readString(localFile);
            expect(writtenContent).to.equal(newText);
        });

        it("Doesn't overwrite an existing S3 file when the overwrite flag is false", async () => {
            const existingText = await instance.readString(s3File);
            await instance.write(newText, s3File, {overwrite: false});
            const writtenContent = await instance.readString(s3File);
            expect(writtenContent).to.equal(existingText);
        });

        it("Doesn't overwrite an existing local file when the overwrite flag is false", async () => {
            const existingText = await instance.readString(localFile);
            await instance.write(newText, localFile, {overwrite: false});
            const writtenContent = await instance.readString(localFile);
            expect(writtenContent).to.equal(existingText);
        });
    });


    it("Deletes a local file", async () => {
        const localFile = join(localTestDir, "foo.txt")
        writeFileSync(localFile, "foo bar");
        await instance.deleteAll({key: localFile});
        expect(existsSync(localFile)).to.equal(false);
    });

    it("Throws an error if the user attempts to wait for a local file to exist", async () => {
        await expect(instance.waitForFile({key: localTestDir})).to.eventually.be.rejectedWith(FsError.LocalFileWait);
    });

    describe("List behaviour", () => {
        let s3Folders: AnyFile[];
        let fileName: string;
        beforeEach(async () => {
            const folderKeys = [
                "foo/bar/",
                "foo/bar/baz/",
                "baz/"
            ].sort();
            fileName = "foo.txt";
            s3Folders = folderKeys.map(f => ({bucket: testBucket, key: f}));
            for (const folder of s3Folders) {
                const fileKey = `${folder.key}${fileName}`;
                await instance.write("foo bar", {bucket: folder.bucket, key: fileKey});
            }
        });

        it("Lists all the S3 folders", async () => {
            const folders = await instance.listS3Folders({
                bucket: testBucket,
                key: ""
            }, `/${fileName}`);
            expect(folders).to.deep.equal(s3Folders);
        });

    });

    describe("An S3 folder containing some files", () => {

        let s3Folder: AnyFile;
        let localFolder: AnyFile;
        let s3Files: ScannedFile[];
        let s3FileInfo: FileInfo[];

        beforeEach("Copy behaviour", async () => {
            const folderKey = "test-folder-foo/bar/baz";
            const testFileContent = [
                "foo",
                "bar",
                "baz"
            ];

            localFolder = {
                key: localTestDir
            };

            s3Folder = {
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
            s3Files = await instance.list(s3Folder);
            s3FileInfo = s3Files.map(toFileInfo).sort(fileInfoComparator);
        });

        it("Downloads the content of the S3 folder to a local folder", async () => {
            await instance.copy(s3Folder, localFolder);
            const allLocalFiles = await instance.list(localFolder);

            const numberOfDownloadedFiles = allLocalFiles.length;
            expect(numberOfDownloadedFiles).to.be.greaterThan(1, "Should have downloaded more than one file");

            const downloadedFileInfo = allLocalFiles.map(toFileInfo).sort(fileInfoComparator);
            expect(s3FileInfo).to.deep.equal(downloadedFileInfo,
                "The downloaded files need to have the same names and content")
        });

        it("Copies the content of an S3 folder to another S3 folder", async () => {
            const destinationFolder = {
                bucket: s3Folder.bucket,
                key: `${s3Folder.key}2`
            }
            await instance.copy(s3Folder, destinationFolder);
            const copiedFiles = await instance.list(destinationFolder);
            const copiedFileInfo = copiedFiles.map(c => toFileInfo(c));
            expect(copiedFileInfo).to.deep.equal(s3FileInfo);
        });

        it("Copies some files in a local folder to another local folder", async () => {
            await instance.copy(s3Folder, localFolder);
            const anotherLocalFolder = {
                key: `${localFolder.key}2`
            };
            await instance.copy(localFolder, anotherLocalFolder);
            const copiedFiles = await instance.list(anotherLocalFolder);
            const copiedFileInfo = copiedFiles.map(c => toFileInfo(c));
            expect(copiedFileInfo).to.deep.equal(s3FileInfo);

        });

        it("Deletes all the files in the folder", async () => {
            await instance.deleteAll(s3Folder);
            const folderContent = await instance.list(s3Folder);
            expect(folderContent).to.deep.equal([]);
        });


    });

    afterEach(() => wipeLocalFolder(localTestDir));

    after(async () => {
        await s3rver.close();
        await wipeLocalFolder(localS3Dir);
    });

});
