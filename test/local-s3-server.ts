import S3rver = require("s3rver");
import S3 from "aws-sdk/clients/s3";
import {Credentials} from "aws-sdk";

import {DirUtils} from "./dir-utils";

export class LocalS3Server {

    private tempDir: string;
    private s3rver: S3rver;
    private hostname = "localhost";

    constructor(private port: number = 4569) {
    }

    get endpoint(): string {
        return `http://${this.hostname}:${this.port}`
    }

    async start(): Promise<void> {
        if (!this.s3rver) {
            this.tempDir = DirUtils.createTempDir();
            this.s3rver = new S3rver({
                port: this.port,
                address: this.hostname,
                silent: true,
                directory: this.tempDir
            });
            await this.s3rver.run();
        }
    }

    createClient(): S3 {
       return new S3({
            credentials: new Credentials("S3RVER", "S3RVER"),
            endpoint: this.endpoint,
            sslEnabled: false,
            s3ForcePathStyle: true
        });
    }

    reset(): void {
        (this.s3rver as S3rver & {reset: () => void}).reset();
    }

    async stop(): Promise<void> {
        await this.s3rver.close();
        await DirUtils.wipe(this.tempDir);
    }
}