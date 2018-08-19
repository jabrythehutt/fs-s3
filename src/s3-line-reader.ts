import {LineReader} from "./line-reader";
import S3 = require("aws-sdk/clients/s3");
import GetObjectOutput = S3.Types.GetObjectOutput;

export class S3LineReader implements LineReader {

    constructor(private objectOutput: GetObjectOutput) {

    }

    hasNext(): boolean {

        const body = this.objectOutput.Body;

        return false;

    }

    nextLine(): string {
        return undefined;
    }

}
