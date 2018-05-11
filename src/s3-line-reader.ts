import {LineReader} from "./line-reader";
import S3 = require("aws-sdk/clients/s3");
import GetObjectOutput = S3.Types.GetObjectOutput;
/**
 * Created by djabry on 30/11/2016.
 */
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
