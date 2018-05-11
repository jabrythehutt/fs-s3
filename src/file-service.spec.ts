/**
 * Created by djabry on 04/06/2016.
 */
/**
 * Created by djabry on 03/05/2016.
 */
import {S3} from "aws-sdk";
import {FileService} from "./file-service";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as S3rver from "s3rver";
import {resolve as resolvePath} from "path";
import {tmpdir} from "os";
import * as del from "del";
let s3: S3;
let fileService: FileService;
const testBucket = "foo";
const testFileText = "This is a test file";
const testFilePath = resolvePath(__dirname, "..", "test", "test-file.txt");
let s3rver;
const testDir = resolvePath(tmpdir(), `s3rver${new Date().getTime()}`);

describe("Test File Service", () => {

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
