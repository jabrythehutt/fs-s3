import {S3FileService} from "./s3-file-service";
import S3 from "aws-sdk/clients/s3";
import {expect, use} from "chai";
import axios from "axios";
import chaiAsPromised from "chai-as-promised";
import {FileContent, S3File} from "../api";
import {defaultContentType} from "./default-content-type";
import {getType} from "mime";
import {ManagedUpload} from "aws-sdk/lib/s3/managed_upload";
import {FileServiceTester, generateTests, LocalS3Server} from "../../test";
import {FpOptional} from "../file-service";
import {S3WriteOptions} from "./s3-write-options";

const bucketExistError = "The specified bucket does not exist";

describe("S3 file service", function() {

    this.timeout(10000);

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

    let instance: S3FileService;
    let s3rver: LocalS3Server;
    let tester: FileServiceTester<S3File, S3WriteOptions>;
    let s3: S3;
    const testBucket = "foo";

    before(async () => {
        use(chaiAsPromised);
        s3rver = new LocalS3Server();
        await s3rver.start();
    });

    beforeEach(async () => {
        s3rver.reset();
        s3 = s3rver.createClient();
        await s3.createBucket({
            Bucket: testBucket
        }).promise();
        instance = new S3FileService(s3);
        tester = new FileServiceTester<S3File, S3WriteOptions>(instance);
    });

    generateTests("Standard tests", () => ({bucket: testBucket, key: ""}), () => tester);

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
            await expect(tester.collectAll({bucket: `${testBucket}bar`, key: ""}))
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
    });

    describe("Reading and writing individual files", () => {

        const fileContent = "bar";
        const file = {
            key: "foo/bar/foo.txt",
            bucket: testBucket
        };
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
            await tester.testWriteRead({
                destination: file,
                body: fileContent
            }, {
                makePublic: true
            });
        });

        it("Provides status updates for objects being uploaded", async () => {
            const progressEvents: ManagedUpload.Progress[] = [];
            await tester.testWriteRead({
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

        describe("With an S3 object present", () => {
            beforeEach(() => uploadFileContent());

            it("Reads the file", async () => {
                await tester.testRead(file, FpOptional.of(fileContent));
            });

            it("Propagates an unexpected error when attempting to scan a file", () => {
                const errorMessage = "foo";
                s3.headObject = () => {
                    throw new Error(errorMessage)
                }
                expect(instance.scan(file)).to.eventually.be.rejectedWith(errorMessage);
            });

            it("Gets a valid link for the file", async () => {
                const link = await instance.getReadUrl(file);
                expect(link.exists).to.equal(true);
                const response = await axios.get(link.value);
                expect(response.data.toString()).to.equal(fileContent);
            });
        });
    });



    after(async () => {
        await s3rver.stop();
    });

});