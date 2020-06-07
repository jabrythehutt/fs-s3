import {S3FileService} from "./s3-file-service";
import {mkdtempSync} from "fs";
import {basename, join} from "path";
import {tmpdir} from "os";
import del from "del";
import S3rver from "s3rver";
import S3 from "aws-sdk/clients/s3";
import {expect, use} from "chai";
import {Credentials} from "aws-sdk";
import axios from "axios";
import chaiAsPromised from "chai-as-promised";
import {createHash} from "crypto";
import {S3File, Scanned, ScannedS3File} from "../api";
import {defaultContentType} from "./default-content-type";
import {FileContent} from "../api/file-content";
import {getType} from "mime";
import {CopyOperation} from "../api/copy-operation";
import {ManagedUpload} from "aws-sdk/lib/s3/managed_upload";
import {CopyOptions} from "../api/copy-options";

const bucketExistError = "The specified bucket does not exist";

function createTempDir(): string {
    return mkdtempSync(join(tmpdir(), "fss3-test-")).toString();
}

async function wipeLocalFolder(localPath: string): Promise<void> {
    await del([localPath], {force: true});
}

async function delay(period: number) {
    await new Promise(resolve => setTimeout(resolve, period));
}

function md5(input: string): string {
    const hash = createHash("md5");
    hash.update(input);
    return hash.digest("hex");
}

function stringSize(input: string): number {
    return Buffer.byteLength(input);
}

type FileInfo = Scanned<{
    fileName: string;
}>;

function describeFile(file: ScannedS3File): FileInfo {
    return {
        fileName: basename(file.key),
        md5: file.md5,
        size: file.size,
        mimeType: file.mimeType
    };
}

describe("S3 file service", function() {

    this.timeout(10000);

    async function readFileContent(file: S3File): Promise<string> {
        const response = await s3.getObject({
            Bucket: file.bucket,
            Key: file.key
        }).promise();
        return response.Body.toString();
    }

    async function collectList(folder: S3File): Promise<ScannedS3File[]> {
        const allFiles = await instance.list(folder);
        const collectedFiles = [];
        for await (const files of allFiles) {
            collectedFiles.push(...files);
        }
        return collectedFiles;
    }

    async function uploadFile(file: S3File, content: FileContent) {
        await s3.putObject({
            Bucket: file.bucket,
            Key: file.key,
            Body: content,
            ContentType: getType(file.key)
        }).promise();
    }

    let instance: S3FileService;
    let s3rver: S3rver;
    let s3: S3;
    let localS3Dir: string;

    const port = 4569;
    const hostname = "localhost";
    const endpoint = `http://${hostname}:${port}`;
    const testBucket = "foo";

    before(async () => {
        use(chaiAsPromised);
        localS3Dir = createTempDir();
        s3rver = new S3rver({
            port,
            address: hostname,
            silent: true,
            directory: localS3Dir
        });
        await s3rver.run();
    });

    beforeEach(async () => {
        (s3rver as any).reset();
        s3 = new S3({
            credentials: new Credentials("S3RVER", "S3RVER"),
            endpoint,
            sslEnabled: false,
            s3ForcePathStyle: true
        });
        await s3.createBucket({
            Bucket: testBucket
        }).promise();
        instance = new S3FileService(s3);
    });

    describe("List behaviour", () => {
        let files: S3File[];
        beforeEach(async () => {
            const fileNames = [
                "foo",
                "bar",
                "baz",
            ]
            files = fileNames.map(n => ({
                bucket: testBucket,
                key: `${n}/${n}.txt`
            }));
            await Promise.all(files.map(f => uploadFile(f, f.key)));
        });

        it("Throws an error when attempting to list a bucket that doesn't exist", async () => {
            await expect(collectList({bucket: `${testBucket}bar`, key: ""}))
                .to.eventually.be.rejectedWith(bucketExistError);
        });

        it("Scrolls through multiple pages of results", async () => {
            const itemsPerPage = 1;
            instance = new S3FileService(s3, itemsPerPage);
            const iterable = instance.list({
                key: "",
                bucket: testBucket
            });
            const pages = [];
            for await (const page of iterable) {
                pages.push(page);
            }
            expect(pages.length).to.equal(files.length / itemsPerPage);
        });

        it("Copies all the files from the root into another folder", async () => {
            const destination = {
                key: "foobar/",
                bucket: testBucket
            };
            const initialFiles = await collectList({
                key: "",
                bucket: testBucket
            });
            await instance.copy({
                source: {
                    key: "",
                    bucket: testBucket
                },
                destination
            });
            const copiedFiles = await collectList(destination);
            expect(initialFiles.map(describeFile)).to.deep.equal(copiedFiles.map(describeFile))
        });
    });

    describe("Reading and writing individual files", () => {

        const fileContent = "bar";
        const file = {
            key: "foo/bar/foo.txt",
            bucket: testBucket
        };
        const contentType = "text/plain";

        async function uploadFileContent() {
            await uploadFile(file, fileContent);
        }

        it("Uses the default content type when a value can't be resolved", async () => {
            const unusualFile = {
                bucket: testBucket,
                key: "foo"
            };
            await instance.write({
                destination: unusualFile,
                body: fileContent
            });
            const object = await s3.getObject({
                Bucket: unusualFile.bucket,
                Key: unusualFile.key
            }).promise();
            expect(object.ContentType).to.equal(defaultContentType);
        });

        it("Throws an error when attempting to write to a non-existent bucket", async () => {
            await expect(instance.write({
                destination: {
                    bucket: `${testBucket}bar`,
                    key: "foo"
                },
                body: fileContent
            })).to.eventually.be.rejectedWith(bucketExistError);
        });

        it("Makes a file public", async () => {
            await expect(instance.write({
                destination: file,
                body: fileContent
            }, {
                makePublic: true
            })).to.eventually.be.fulfilled;
        });

        it("Provides status updates for objects being uploaded", async () => {
            const progressEvents: ManagedUpload.Progress[] = [];
            await instance.write({
                destination: file,
                body: fileContent
            }, {
                progressListener: p => progressEvents.push(p)
            });
            expect(progressEvents.length).to.be.at.least(1)
        });

        it("Gets an empty response when attempting to get a link for a non-existent file", async () => {
            const optionalLink = await instance.getReadUrl(file, 12345);
            expect(optionalLink.exists).to.equal(false);
        });

        it("Gets an empty response when trying to read a non-existent file", async () => {
            const optionalFile = await instance.read(file);
            expect(optionalFile.exists).to.equal(false);
        });

        it("Gets an empty response when trying to scan a non-existent file", async () => {
            const fileInfo = await instance.scan(file);
            expect(fileInfo.exists).to.equal(false);
        });

        it("Uploads a file", async () => {
            await instance.write({
                destination: file,
                body: fileContent
            });
            expect(await readFileContent(file)).to.equal(fileContent);
        });

        it("Waits for a file to exist", async () => {
            const fileExistsPromise = instance.waitForFile(file);
            await delay(100);
            await uploadFileContent();
            await expect(fileExistsPromise).to.eventually.be.fulfilled;

        });

        describe("With an S3 object present", () => {
            beforeEach(() => uploadFileContent());

            it("Reads the file", async () => {
                const optionalFile = await instance.read(file);
                expect(optionalFile.exists).to.equal(true, "Should have read a file");
                expect(optionalFile.value.toString()).to.equal(fileContent);
            });

            it("Propagates an unexpected error when attempting to scan a file", () => {
                const errorMessage = "foo";
                s3.headObject = () => {
                    throw new Error(errorMessage)
                }
                expect(instance.scan(file)).to.eventually.be.rejectedWith(errorMessage);
            });

            it("Deletes the file", async () => {
                await instance.delete(file);
                const response = await s3.listObjectsV2({
                    Bucket: testBucket,
                    Prefix: file.key
                }).promise();
                expect(response.Contents).to.deep.equal([]);
            });

            it("Listens for the deleted files", async () => {
                const deletedFiles: ScannedS3File[] = [];
                const expectedDeletedFiles = await collectList(file);
                await instance.delete(file, {
                    listener: f => deletedFiles.push(f)
                });
                expect(deletedFiles).to.deep.equal(expectedDeletedFiles);
            });

            it("Gets a valid link for the file", async () => {
                const link = await instance.getReadUrl(file);
                expect(link.exists).to.equal(true);
                const response = await axios.get(link.value);
                expect(response.data.toString()).to.equal(fileContent);
            });

            it("Scans the content of the file", async () => {
                const fileInfo = await instance.scan(file);
                expect(fileInfo.exists).to.equal(true);
                const expectedInfo: ScannedS3File = {
                    ...file,
                    md5: md5(fileContent),
                    size: stringSize(fileContent),
                    mimeType: contentType
                }
                expect(fileInfo.value).to.deep.equal(expectedInfo);
            });

            it("Copies the file to another location", async () => {
                const destination = {
                    bucket: testBucket,
                    key: "bar/baz/foo.txt"
                }
                await instance.copy({
                    source: file,
                    destination
                });
                expect(await readFileContent(destination)).to.equal(fileContent);
            });

            it("Listens to copy operations", async () => {
                const copyOperations = [];
                const destination = {
                    bucket: testBucket,
                    key: "baz/foo.txt"
                }
                await instance.copy({
                    source: file,
                    destination
                }, {
                    listener: operation => copyOperations.push(operation)
                });
                const expectedCopyOperation: CopyOperation<S3File, S3File> = {
                    source: (await instance.scan(file)).value,
                    destination
                };
                expect(copyOperations).to.deep.equal([expectedCopyOperation]);
            });

            describe("Copy overwrite behaviour", () => {
                let destination: S3File;
                let options: CopyOptions<S3File, S3File>;
                let copyOperations: CopyOperation<S3File, S3File>[];

                beforeEach(async () => {
                    destination = {
                        bucket: testBucket,
                        key: "foobar.txt"
                    };
                    await instance.copy({source: file, destination});
                    copyOperations = [];
                    options = {
                        listener: operation => copyOperations.push(operation)
                    }
                });

                it("Overwrites an existing file when copying a file using the overwrite option", async () => {
                    options.overwrite = true;
                    await instance.copy({source: file, destination}, options);
                    expect(copyOperations).to.have.lengthOf(1);
                });

                it("Doesn't overwrite an existing file when copying a file not set to overwrite", async () => {
                    options.overwrite = false;
                    await instance.copy({source: file, destination}, options);
                    expect(copyOperations).to.have.lengthOf(0);
                });

                it("Doesn't overwrite identical content when content-based skipping is enabled", async () => {
                    options.overwrite = true;
                    options.skipSame = true;
                    await instance.copy({source: file, destination}, options);
                    expect(copyOperations).to.have.lengthOf(0);
                });

                it("Overwrites different content when content-based skipping is enabled", async () => {
                    options.overwrite = true;
                    options.skipSame = true;
                    const otherFile = {bucket: testBucket, key: "otherfile.txt"};
                    await uploadFile(otherFile, "other content");
                    await instance.copy({source: otherFile, destination}, options);
                    expect(copyOperations).to.have.lengthOf(1);
                });
            });

            it("Doesn't copy a file when the destination is the same", async () => {
                const copyOperations = [];
                await instance.copy({
                    source: file,
                    destination: file
                }, {
                    overwrite: true,
                    listener: operation => copyOperations.push(operation)
                });
                expect(copyOperations).to.deep.equal([]);
            });


            describe("Overwrite behaviour", () => {
                const newContent = `${fileContent}bar`;
                it("Doesn't overwrite an existing file when the overwrite option is false", async () => {
                    await instance.write({
                        destination: file,
                        body: newContent
                    }, {overwrite: false});
                    expect(await readFileContent(file)).to.equal(fileContent);
                });
                it("Overwrites an existing file when the overwrite option is true", async () => {
                    await instance.write({
                        destination: file,
                        body: `${fileContent}bar`
                    }, {overwrite: true});
                    expect(await readFileContent(file)).to.equal(newContent);
                });
            });
        });
    });



    after(async () => {
        await s3rver.close();
        await wipeLocalFolder(localS3Dir);
    });

});