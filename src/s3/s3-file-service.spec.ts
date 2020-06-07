import {S3FileService} from "./s3-file-service";
import {mkdtempSync} from "fs";
import {join} from "path";
import {tmpdir} from "os";
import del from "del";
import S3rver from "s3rver";
import S3 from "aws-sdk/clients/s3";
import {expect, use} from "chai";
import {Credentials} from "aws-sdk";
import axios from "axios";
import chaiAsPromised from "chai-as-promised";
import {createHash} from "crypto";
import {S3File, ScannedS3File} from "../api";
import {defaultContentType} from "./default-content-type";
import {FileContent} from "../api/file-content";
import {getType} from "mime";

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

describe("S3 file service", function() {

    async function readFileContent(file: S3File): Promise<string> {
        const response = await s3.getObject({
            Bucket: file.bucket,
            Key: file.key
        }).promise();
        return response.Body.toString();
    }

    async function uploadFile(file: S3File, content: FileContent) {
        await s3.putObject({
            Bucket: file.bucket,
            Key: file.key,
            Body: content,
            ContentType: getType(file.key)
        }).promise();
    }

    this.timeout(10000);

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

        it("Copies all the files from the root into another folder", async () => {
            const destination = {
                key: "foobar/",
                bucket: testBucket
            };
            await instance.copy({
                source: {
                    key: "",
                    bucket: testBucket
                },
                destination
            });
            const allFiles = instance.list(destination);
            const collectedFiles = [];
            for await (const l of allFiles) {
                collectedFiles.push(...l);
            }
            console.log(collectedFiles);
            expect(collectedFiles.length).to.equal(files.length);
        });
    });

    describe("Reading and writing individual files", () => {

        const fileContent = "bar";
        const file = {
            key: "foo.txt",
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

        it("Makes a file public", async () => {
            await expect(instance.write({
                destination: file,
                body: fileContent
            }, {
                makePublic: true
            })).to.eventually.be.fulfilled;
        });

        it("Provides status updates for objects being uploaded", async () => {
            let progressEvent: ProgressEvent;
            await instance.write({
                destination: file,
                body: fileContent
            }, {
                progressListener: p => progressEvent = p
            });
            expect(progressEvent).to.be.an("object");
            expect(progressEvent.loaded).to.be.a("number");
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