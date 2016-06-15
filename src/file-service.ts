/**
 * Created by djabry on 04/06/2016.
 */
import {S3} from "aws-sdk";
import * as fs from "fs";
import * as path from "path";
import * as mime from "mime";
import * as crypto from "crypto";
import {IFileService} from "./ifile-service";
import {ScannedFile} from "./scanned-file";
import {AnyFile} from "./any-file";
import {WriteOptions} from "./write-options";

/**
 * Created by djabry on 17/05/2016.
 */









export class FileService implements IFileService {


    getReadURL(file:ScannedFile):Promise<string> {

        if (file.bucket) {

            return this.s3Promise.then(s3 => {

                return new Promise((resolve, reject) => {
                    //Create a link that lasts for 24h
                    var expires = 60 * 60 * 24;

                    s3.getSignedUrl('getObject', {Bucket: file.bucket, Key: file.key, Expires: expires}, (err, url) => {


                        if (err) {

                            reject(err);
                        } else {

                            resolve(url);

                        }

                    });

                });


            });
        } else {

            return new Promise((resolve, reject) => {
                reject("Operation not supported for local files");
            });
        }


    }

    /**
     * Execute promises in series or parallel
     */
    process<A, B>(inputElements:A[], processor:(element:A) => Promise<B>, parallel:boolean):Promise<B[]> {

        if (parallel) {

            //Process all in parallel
            var outputPromises:Promise<B>[] = inputElements.map(inputElement => {
                return processor(inputElement);
            });


            //es6-shim typings don't seem to be correct so need to do this workaround for Promise.all
            return Promise.all(outputPromises).then((results:any) => {

                return <B[]>results;
            });



        } else {

            //Otherwise do in series
            var promise:Promise<B[]> =Promise.resolve(<B[]>[]);

            // console.log("Creating queue for", JSON.stringify(inputElements));

            inputElements.forEach(element => {

                promise = promise.then((outputElements) => {

                    return processor(element).then(outputElement => {

                        outputElements.push(outputElement);
                        return outputElements;
                    });

                });
            });

            return promise;
        }



    }

    promisify<A, B>(inputFunction:(inputParams:A, callback:(err, data:B)=>any)=>any, inputParams:A):Promise<B> {

        //console.log("Promisifying", inputFunction, inputParams);
        return new Promise((resolve, reject) => {

            try {

                inputFunction(inputParams, (err, data) => {

                    //console.log("Completed execution");
                    if (err) {
                        console.log(err);
                        reject(err);
                    } else {

                        resolve(data);
                    }

                });


            } catch (err) {
                console.log(err);
                reject(err);
            }


        });
    }

    /**
     * Waits for a file to be written
     * @param file {object} - The file to wait for
     */
    waitForFile(file:AnyFile):Promise<ScannedFile> {
        if (!file.bucket) {
            //Local wait is not supported yet
            throw new Error("Local waiting is not supported yet");

        } else {

            return this.s3Promise.then(s3 => {

                return s3.waitFor('objectExists', {Bucket: file.bucket, Key: file.key}).promise().then(data => {

                    /*return {
                        bucket: file.bucket,
                        key: file.key,
                        md5: JSON.parse(data.ETag),
                        size: data.Size,
                        mimeType: mime.lookup(file.key)
                     };*/


                    //Strange behaviour when file already exists leading to no ETag or size being present in result,
                    //List object instead

                    return this.isFile(file);



                });

            });


        }
    }


    fixFile<T extends AnyFile>(destination:T):T {


        if (destination.bucket) {
            //Replace any back slashes with forward slashes in case using windows
            destination.key = destination.key.replace(/\\/g, "/");

            //Remove any prefix forward slashes

            if (destination.key.indexOf("/") === 0) {
                destination.key = destination.key.replace("/", "");
            }

        }

        return destination;


    }


    doWriteToS3(body, destination:AnyFile, options:WriteOptions):Promise<ScannedFile> {

        options = options || {};

        destination = this.fixFile(destination);

        var completeMessage = "Completed upload to " + this.toFileString(destination);


        return new Promise((resolve, reject) => {

            var extraParams = options.s3Params || {};

            var s3Params = {
                //Replace any backslashes introduced by Windows local files
                Key: destination.key,
                Bucket: destination.bucket,
                Body: body,
                ContentType: mime.lookup(destination.key) || 'application/octet-stream',
                ACL: options.makePublic ? "public-read" : null
            };

            Object.keys(extraParams).forEach(extraKey => {
                //console.log("Setting extra S3 params:", extraKey, "to", extraParams[extraKey]);
                s3Params[extraKey] = extraParams[extraKey];
            });

            if (Object.keys(extraParams).length) {

                //console.log("Added extra s3 params to request: ", s3Params);
            }


            this.s3Promise.then(s3 => {

                s3.upload(s3Params).send((err, data) => {

                    if (err) {
                        console.log(err);
                        reject(err);

                    } else {

                        console.log(completeMessage);

                        this.scanFile(destination).then(result => {

                            resolve(result);

                        }, err => {

                            console.log(err);
                            reject(err);
                        });

                    }

                });
            });
        });

    }


    doUploadFile(file:File, destination:AnyFile, destinationFiles:ScannedFile[], options:WriteOptions):Promise<ScannedFile> {

        var existingFile = destinationFiles.find((existingFile) => {
            return existingFile.key === destination.key
        });

        var skip = existingFile && !options.overwrite;

        if (!skip) {

            return this.calculateUploadMD5(file).then(md5 => {
                destination["md5"] = md5;
                return this.doWriteToS3(file, destination, options);
            });

        } else {

            return this.scanFile(existingFile);
        }

    }


    /**
     *  Upload a single file from the browser
     * @param file
     * @param destination
     * @param writeOptions
     */
    uploadFile(file:File, destination:AnyFile, writeOptions?:WriteOptions, destinationFiles?:ScannedFile[]):Promise<ScannedFile> {

        writeOptions = writeOptions || {overwrite: false, makePublic: false};

        if (destinationFiles) {

            return this.doUploadFile(file, destination, destinationFiles, writeOptions);

        } else {

            return this.findDestinationFiles(writeOptions, destination).then(destinationFiles => {

                return this.doUploadFile(file, destination, destinationFiles, writeOptions);

            });

        }


    }


    /**
     * Upload files in the browser
     * @param files
     * @param destinationFolder
     * @param writeOptions
     */
    uploadFiles(inputList:FileList, destinationFolder:AnyFile, options?:WriteOptions):Promise<ScannedFile[]> {

        options = options || {makePublic: false, parallel: false, overwrite: false, skipSame: true};

        var sourceFiles = [];
        //Arrange input files into a regular array
        for (var ix = 0; ix < inputList.length; ix++) {

            var file = inputList.item(ix);
            sourceFiles.push(file);

        }

        return this.findDestinationFiles(options, destinationFolder).then(destinationFiles => {

            var processor = (inputFile:File) => {
                var key = destinationFolder.key + "/" + inputFile.name;

                var destinationFile:AnyFile = {
                    bucket: destinationFolder.bucket,
                    key: key
                };

                return this.uploadFile(inputFile, destinationFile, options, destinationFiles);

            };

            return this.process(sourceFiles, processor, options.parallel);



        });


    }


    ensureDirectoryExistence(filePath) {

        var dirname = path.dirname(filePath);
        if (this.directoryExists(dirname)) {
            return true;
        }
        this.ensureDirectoryExistence(dirname);
        fs.mkdirSync(dirname);
    }

    directoryExists(path) {


        try {
            return fs.statSync(path).isDirectory();
        }
        catch (err) {
            return false;
        }
    }


    /**
     * Checks if it exists and is a file
     * @param file
     */
    isFile(file:AnyFile):Promise<ScannedFile> {

        return this.list(file).then(files => {

            if (files.length === 1) {

                return files[0];

            } else {

                return null;
            }
        });
    }

    private s3Promise:Promise<S3>;


    /**
     *
     * @param s3 - {S3 | Promise<S3>} Either an s3 object or a promise of one
     */
    constructor(s3:S3 | Promise<S3>) {

        if (typeof s3["then"] === "function") {

            this.s3Promise = <Promise<S3>>s3;

        } else {

            this.s3Promise = Promise.resolve(s3);

        }

    }


    readBlob(blob:Blob):Promise<string> {

        return new Promise((resolve, reject)=> {

            var reader = new FileReader();
            reader.onload = (evt) => {
                var rangeString = evt.target["result"];
                resolve(rangeString);
            };

            reader.onerror = (err) => {

                console.log(err);
                reject(err);
            };

            reader.readAsBinaryString(blob);

        });

    }

    /**
     * Calculate the MD5 checksum of a browser file
     * @param file {File}
     * @returns {any|Promise<T>|Promise}
     */
    calculateUploadMD5(file:File):Promise<string> {


        var hash = crypto.createHash('md5');
        var currentIndex = 0;

        //Read 100kb at a time
        var delta = 1024 * 100;


        var processPart = () => {

            var complete = currentIndex >= file.size - 1;

            if (complete) {

                var blob = file.slice(currentIndex, Math.min(currentIndex + delta, file.size - 1));

                return this.readBlob(blob).then((sectionString) => {

                    hash.update(sectionString);
                    currentIndex += delta + 1;

                    return processPart()

                });

            } else {

                return new Promise((resolve, reject) => {

                    resolve(hash.digest('hex'));

                });
            }


        };

        return processPart();

    }


    calculateStreamMD5(stream:fs.ReadStream):Promise<string> {


        var hash = crypto.createHash("md5");

        return new Promise((resolve, reject) => {

            stream.on('data', (data) => {
                hash.update(data, 'utf8')
            });

            stream.on('error', (err) => {
                console.log(err);
                reject(err);
            });

            stream.on('end', () => {

                var result = hash.digest('hex'); // e.g. 34f7a3113803f8ed3b8fd7ce5656ebec
                //console.log("Completed md5 calculation: ", result);
                resolve(result);

            });


        });

    }


    scanFile(file:AnyFile):Promise<ScannedFile> {

        if (file["md5"] && file["size"] && file["mimeType"]) {

            return new Promise((resolve, reject) => {
                var scannedFile = <ScannedFile>file;
                resolve(scannedFile);

            });


        } else {

            if (file.bucket) {

                return this.listS3(file.bucket, file.key).then(scannedFiles => {
                    return scannedFiles[0];

                });

            } else {


                return this.calculateLocalMD5(file.key).then(md5 => {

                    return this.calculateLocalFileSize(file.key).then(fileSize => {

                        return <ScannedFile>{
                            key: file.key,
                            md5: md5,
                            size: fileSize,
                            mimeType: mime.lookup(file.key)
                        };
                    });

                });
            }

        }

    }

    calculateLocalMD5(localPath:string):Promise<string> {
        //Once the file has been downloaded, calculate the checksum
        // console.log("Starting md5 calculation");


        var stream:fs.ReadStream = fs.createReadStream(localPath);

        return this.calculateStreamMD5(stream);

    }

    calculateLocalFileSize(localPath:string):Promise<number> {

        localPath = path.resolve(localPath);

        return this.promisify(fs.stat, localPath).then(stat => {
            return stat.size;
        });
    }

    /**
     * Read the contents of a file into a string
     * @param file {object} - The file to read
     */
    readString(file:AnyFile):Promise<string> {


        if (file.bucket) {


            return this.s3Promise.then(s3 => {

                return s3.getObject({Bucket: file.bucket, Key: file.key}).promise().then(data => {

                    return data.Body.toString();

                });
            })


        } else {
            //If it's a local file then read it from the local filesystem

            return this.promisify(fs.readFile, file.key).then(result => {

                return result.toString();
            });

        }




    }


    listS3(bucket:string, prefix:string, suffix?:string, marker?:string):Promise<ScannedFile[]> {

        // console.log("Listing s3");
        return this.s3Promise.then(s3 => {

            return s3.listObjects({
                Bucket: bucket,
                MaxKeys: 1000000,
                Prefix: prefix,
                Delimiter: suffix,
                Marker: marker
            }).promise().then(data => {


                //Add all the files to the items list
                var items:AnyFile[] = data.Contents.map(item => {
                    return {
                        bucket: bucket,
                        key: item.Key,
                        md5: JSON.parse(item.ETag),
                        size: item.Size,
                        mimeType: mime.lookup(item.Key)
                    };
                });


                if (data.IsTruncated) {

                    marker = data.NextMarker || data.Contents[data.Contents.length - 1].Key;

                    return this.listS3(bucket, prefix, suffix, marker).then(resultItems => {

                        items = items.concat(resultItems);
                        return items;

                    });


                } else {

                    return items;
                }
            });

        });


    }


    scanLocalFile(filePath:string):Promise<ScannedFile> {


        return this.calculateLocalFileSize(filePath).then(fileSize=> {

            return this.calculateLocalMD5(filePath).then(md5 => {

                return {
                    key: filePath,
                    md5: md5,
                    size: fileSize,
                    mimeType: mime.lookup(filePath)
                };
            });

        });

    }


    //Find all the paths of all the local files
    doListLocal(dir:string):string[] {


        var results:string[] = [];

        try {
            var stat = fs.statSync(dir);
            if (stat && stat.isDirectory()) {
                var list = fs.readdirSync(dir);
                list.forEach((file) => {
                    file = path.resolve(dir, file);

                    var stat = fs.statSync(file);

                    if (stat && stat.isDirectory()) {

                        results = results.concat(this.doListLocal(file));
                    } else {

                        results.push(file);
                    }
                });

            } else if (stat && !stat.isDirectory()) {

                //Handle the case where it's just a file
                results.push(dir);
            }

        } catch (err) {

            //Assume that an error means the file/folder doesn't exist

        }

        return results;


    }


    listLocal(dir:string):Promise<ScannedFile[]> {



        try {



            dir = path.resolve(dir);

            var files = this.doListLocal(dir);

            var processor = (localFile:string) => {

                return this.scanLocalFile(localFile);
            };

            return this.process(files,processor,true);


        } catch (err) {

            console.log(err);


            return new Promise((resolve,reject) => {
                reject(err);
            });


        }




    }

    /**
     * Recursively list all the files in the dir
     * @param file {AnyFile}
     */
    list(file:AnyFile):Promise<ScannedFile[]> {
        //console.log("Listing files", JSON.stringify(file));
        file = this.fixFile(file);

        if (file.bucket) {
            //List s3

            return this.listS3(file.bucket, file.key);

        } else {

            return this.listLocal(file.key);

        }
    }


    doSkip(source:ScannedFile, destination:AnyFile, existingFiles:ScannedFile[], options:WriteOptions):boolean {

        if (source.bucket == destination.bucket && source.key === destination.key) {
            //Skip if the file is the same
            return true;
        }


        if (options.overwrite && !options.skipSame) {
            //Never skip when intending to overwrite and not skip same files
            return false;
        }


        //Find out if the key is the same
        return existingFiles.find( (existingFile) => {

                var sameFilename = existingFile.key === destination.key;

                var sameFile = existingFile.md5 === source.md5;

                return (sameFilename && !options.overwrite) || (sameFile && sameFilename);

            }) && true;

    }


    doCopyFile(sourceFile:ScannedFile, destination:AnyFile, destinationList:ScannedFile[], options:WriteOptions):Promise<AnyFile> {

        //console.log("Copying: ", source.bucket + "/" + source.key, "to", destination.bucket + "/" + destination.key);
        destination = this.fixFile(destination);

        var completeMessage = "Copied " + this.toFileString(sourceFile) + " to " + this.toFileString(destination);

        return this.s3Promise.then(s3 => {

            return new Promise((resolve, reject) => {

                var skip = this.doSkip(sourceFile, destination, destinationList, options);
                options = options || {};

                if (!skip) {
                    if (sourceFile.bucket && destination.bucket) {
                        //Scenario 1: s3 to s3

                        options.s3Params = options.s3Params || {};

                        var copyObjectRequest = {
                            CopySource: sourceFile.bucket + "/" + sourceFile.key,
                            Bucket: destination.bucket,
                            Key: destination.key,
                            ACL: options.makePublic ? "public-read" : null
                        };

                        Object.keys(options.s3Params).forEach(extraKey => {
                            //console.log("Setting extra S3 params:", extraKey, "to", options.s3Params[extraKey]);
                            copyObjectRequest[extraKey] = options.s3Params[extraKey];
                        });

                        if (Object.keys(options.s3Params).length) {

                            //  console.log("Extra properties added to S3 request",copyObjectRequest);
                        }

                        s3.copyObject(copyObjectRequest).promise().then(data => {
                            console.log(completeMessage);
                            resolve(destination);

                        }, err => {

                            reject(err);
                        });

                    } else if (sourceFile.bucket && !destination.bucket) {
                        //Scenario 2: s3 to local

                        this.ensureDirectoryExistence(destination.key);

                        var file = fs.createWriteStream(destination.key);
                        var readStream = s3.getObject({Key: sourceFile.key, Bucket: sourceFile.bucket})
                            .createReadStream();

                        file.on("error", (err) => {
                            console.log(err);
                            reject(err);
                        });


                        file.on("close", (ex) => {
                            console.log(completeMessage);
                            resolve(destination);
                        });

                        readStream.pipe(file);


                    } else if (!sourceFile.bucket && destination.bucket) {
                        //Scenario 3: local to s3

                        var body = fs.createReadStream(sourceFile.key);

                        this.doWriteToS3(body, destination, options).then((dest) => {

                            resolve(dest);
                        }, err => {

                            console.log(err);
                            reject(err);
                        });

                    } else if (!sourceFile.bucket && !destination.bucket) {

                        //Scenario 4: local to local

                        this.ensureDirectoryExistence(destination.key);

                        var rd = fs.createReadStream(sourceFile.key);
                        rd.on("error", (err) => {
                            console.log(err);
                            reject(err);
                        });
                        var wr = fs.createWriteStream(destination.key);

                        wr.on("error", (err) => {
                            console.log(err);
                            reject(err);
                        });
                        wr.on("close", (ex) => {
                            console.log(completeMessage);
                            resolve(destination);
                        });

                        rd.pipe(wr);

                    }


                } else {

                    console.log("Skipping existing file: ", this.toFileString(destination));
                    resolve(destination);
                }


            });




        });


    }

    findDestinationFiles(options:WriteOptions, destinationDir:AnyFile):Promise<ScannedFile[]> {


        if (options.overwrite && !options.skipSame) {
            //Do not list files if overwriting and not skipping same files
            return new Promise((resolve, reject) => {
                resolve([])
            });

        } else {

            return this.list(destinationDir);

        }

    }


    doDeleteFile(file:AnyFile):Promise<AnyFile> {

        var completeMessage = "Deleted file " + this.toFileString(file);

        if (file.bucket) {
            //Delete S3

            return this.s3Promise.then(s3 => {
                return s3.deleteObject({Bucket: file.bucket, Key: file.key}).promise().then(data => {

                    console.log(completeMessage);
                    return file;

                });

            });


        } else {
            //Delete local file


            return this.promisify(fs.unlink, file.key).then(() => {
                console.log(completeMessage);
                return file;

            });


        }


    }


    /**
     * Delete all files in the folder
     * @param file
     * @param parallel
     */
    deleteAll(file:AnyFile, parallel?:boolean):Promise<AnyFile[]> {


        return this.list(file).then(files => {

            // console.log("Deleting files", JSON.stringify(files));
            var processor = (inputFile:AnyFile) => {
                return this.doDeleteFile(inputFile);
            };

            return this.process(files, processor, parallel);



        });
    }


    /**
     * Copy all file/s from one location to another
     *
     * @param source {object} - The source file or directory
     * @param destination {object} - The destination file or directory
     * @param options {object} - The optional set of write parameters
     */
    copy(source:AnyFile, destination:AnyFile, options?:WriteOptions):Promise<ScannedFile[]> {

        options = options || {makePublic: false, parallel: false, overwrite: false, skipSame: true};

        //Fix file paths if they are local
        if (!source.bucket) {
            source.key = path.resolve(source.key);
        }

        if (!destination.bucket) {
            destination.key = path.resolve(destination.key);
        }


        //Recursively list all the source files
        return this.list(source).then(sourceFiles => {

            return this.findDestinationFiles(options, destination).then(destinationFiles => {

                var sourceFolderPath = source.key;
                var destinationFolderPath = destination.key;

                var processor = (inputFile:ScannedFile) => {

                    var destinationKey = inputFile.key.replace(sourceFolderPath, destinationFolderPath);
                    var destinationFile:ScannedFile = {
                        bucket: destination.bucket,
                        key: destinationKey,
                        md5: inputFile.md5,
                        size: inputFile.size,
                        mimeType: mime.lookup(destinationKey)
                    };

                    destinationFile = this.fixFile(destinationFile);

                    return this.doCopyFile(inputFile, destinationFile, destinationFiles, options);

                };

                return this.process(sourceFiles, processor, options.parallel);

            });

        });


    }

    toFileString(file:AnyFile):string {

        return (file.bucket || "") + "/" + file.key;
    }

    /**
     * Write data to a file
     * @param body {string | fs.ReadStream} - The data to write
     * @param file {object} - The destination file to write
     * @param options {object} - The optional set of write parameters
     */
    write(body:string | fs.ReadStream, file:AnyFile, options?:WriteOptions):Promise<ScannedFile> {
        options = options || {makePublic: false, parallel: false, overwrite: true, skipSame: true};

        return this.isFile(file).then(isFile => {

            if (!options.overwrite && isFile) {

                console.log("Skipping writing existing file", this.toFileString(isFile));
                return isFile;

            } else {

                if (file.bucket) {

                    return this.doWriteToS3(body, file, options);

                } else {




                    //console.log("Writing string to", file.key);

                    return new Promise((resolve, reject) => {

                        try {

                            this.ensureDirectoryExistence(file.key);
                            fs.writeFile(file.key, body, (err) => {

                                if (err) {
                                    console.log(err);
                                    reject(err);

                                } else {
                                    console.log("Written string to file", file.key);

                                    this.scanFile(file).then(scannedFile => {
                                        resolve(scannedFile);
                                    });

                                }
                            });

                        } catch (err) {

                            reject(err);
                        }

                    });


                }


            }

        });

    }


}