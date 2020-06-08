import {NodeFileService} from "./node-file-service";
import {LocalS3Server} from "../../test/local-s3-server";
import * as S3 from "aws-sdk/clients/s3";
import {LocalFileService} from "./local-file-service";
import {S3FileService} from "../s3";

describe("Node file service", () => {
    let instance: NodeFileService;
    let s3: S3;
    let s3rver: LocalS3Server;

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
    });

    describe("Individual file operations", () => {
        it("Writes a local file", async () => {
            await instance.write({body: "foo", destination: {key: "bar.txt"}})
        });
    });

    after(async () => {
        await s3rver.stop();
    });
});