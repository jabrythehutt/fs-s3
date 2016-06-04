/**
 * Created by djabry on 04/06/2016.
 */
/**
 * Created by djabry on 03/05/2016.
 */
import {S3} from "aws-sdk";
import {FileService} from "../src/file-service";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
var testConfig = require("./test-config.json");

var s3Params = testConfig.s3;

const s3 = new S3(s3Params);
var fileService = new FileService(s3);

var testBucket = testConfig.s3.params.Bucket;

var testFilePath = "test/test-file.txt";
var s3Destination = "test/"+(new Date()).getTime() +".txt";
var testFileText = "This is a test file";
var testFileMD5 = "0b26e313ed4a7ca6904b0e9369e5b957";

function deleteAllTestFiles () {

    //Delete the local and remote files before each test
    try {

        fs.unlinkSync(path.resolve(testFilePath));
    } catch(err ) {

        //Assume this happens if the file doesn't exist
    }

    return s3.deleteObject({Bucket:testBucket,Key:s3Destination}).promise()


}

describe("Test File Service", function () {


    beforeEach(function(done){

       deleteAllTestFiles().then(() => {

            done();

        }, err => {

            console.log(err);
            done(err);

        });

    });

    it("Should write a local file", function(done){

        fileService.write(testFileText,{key: testFilePath},{overwrite:true, skipSame:false}).then(() => {

            //Read the local file to see if it's actually been written
            var fileText  = fs.readFileSync(path.resolve(testFilePath)).toString();

            assert(fileText === testFileText, "Wrong text found in file");

            done();
        }, err => {

            assert(!err,err);
            done(err);
        });
    });


    it("Should write an S3 file", function(done) {

        fileService.write(testFileText,{bucket: testBucket, key: s3Destination},{overwrite:true, skipSame:false}).then(() => {

            s3.getObject({Key:s3Destination,Bucket:testBucket}).promise().then(fileObject => {

                assert(fileObject.Body.toString() === testFileText,"Wrong text found in file");

                done();
            });


        }, err => {

            assert(!err,err);
            done(err);
        });

    });



    after(function(done){

        deleteAllTestFiles().then(() => {

            done();

        }, err => {

            console.log(err);
            done(err);

        });
    });
    

});