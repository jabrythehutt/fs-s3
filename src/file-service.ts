/**
 * Created by djabry on 04/06/2016.
 */
import {S3} from "aws-sdk";
import * as fs from "fs";
import * as path from "path";
import {getType} from "mime";
import {createHash} from "crypto";
import {IFileService} from "./ifile-service";
import {ScannedFile} from "./scanned-file";
import {AnyFile} from "./any-file";
import {WriteOptions} from "./write-options";
import {unlinkSync} from "fs";

/**
 * Created by djabry on 17/05/2016.
 */

export class FileService implements IFileService {

    private s3Promise: Promise<S3>;

    /**
     *
     * @param s3 - {S3 | Promise<S3>} Either an s3 object or a promise of one
     */
    constructor(s3: S3 | Promise<S3>) {

        if (typeof s3["then"] === "function") {

            this.s3Promise = s3 as Promise<S3>;

        } else {

            this.s3Promise = Promise.resolve(s3);

        }

    }

    getReadURL(file: ScannedFile, expires?: number): Promise<string> {

        // Create a link that lasts for 24h by default
        expires = expires || 60 * 60 * 24;

        if (file.bucket) {

            return this.s3Promise.then(s3 => {

                return new Promise<string>((resolve, reject) => {

                    s3.getSignedUrl("getObject", {Bucket: file.bucket, Key: file.key, Expires: expires}, (err, url) => {

                        if (err) {

                            reject(err);
                        } else {

                            resolve(url);

                        }

                    });

                });

            });
        } else {

            return Promise.reject<string>("Operation not supported for local files");

        }

    }

    /**
     * Execute promises in series or parallel
     */
    process<A, B>(inputElements: A[], processor: (element: A) => Promise<B>, parallel: boolean): Promise<B[]> {

        if (parallel) {

            // Process all in parallel
            const outputPromises: Array<Promise<B>> = inputElements.map(inputElement => {
                return processor(inputElement);
            });

            // es6-shim typings don't seem to be correct so need to do this workaround for Promise.all
            return Promise.all(outputPromises).then((results: any) => {

                return results as B[];
            });

        } else {

            // Otherwise do in series
            let promise: Promise<B[]> = Promise.resolve([] as B[]);

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

    promisify<A, B>(inputFunction: (inputParams: A, callback: (err, data: B) => any) => any, inputParams: A):
        Promise<B> {

        // console.log("Promisifying", inputFunction, inputParams);
        return new Promise((resolve, reject) => {

            try {

                inputFunction(inputParams, (err, data) => {

                    // console.log("Completed execution");
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
    waitForFile(file: AnyFile): Promise<ScannedFile> {
        if (!file.bucket) {
            // Local wait is not supported yet
            throw new Error("Local waiting is not supported yet");

        } else {

            return this.s3Promise.then(s3 => {

                return s3.waitFor("objectExists", {Bucket: file.bucket, Key: file.key}).promise().then(data => {

                    /*return {
                     bucket: file.bucket,
                     key: file.key,
                     md5: JSON.parse(data.ETag),
                     size: data.Size,
                     mimeType: mime.lookup(file.key)
                     };*/

                    // Strange behaviour when file already exists leading to no ETag or size being present in result,
                    // List object instead

                    return this.isFile(file);

                });

            });

        }
    }

    fixFile<T extends AnyFile>(destination: T): T {

        if (destination.bucket) {
            // Replace any back slashes with forward slashes in case using windows
            destination.key = destination.key.replace(/\\/g, "/");

            // Remove any prefix forward slashes

            if (destination.key.indexOf("/") === 0) {
                destination.key = destination.key.replace("/", "");
            }

        }

        return destination;

    }

    doWriteToS3(body, destination: AnyFile, options: WriteOptions): Promise<ScannedFile> {

        options = options || {};

        destination = this.fixFile(destination);

        const completeMessage = `Completed upload to ${this.toFileString(destination)}`;

        const extraParams = options.s3Params || {};

        const s3Params = {
            // Replace any backslashes introduced by Windows local files
            Key: destination.key,
            Bucket: destination.bucket,
            Body: body,
            ContentType: getType(destination.key) || "application/octet-stream",
            ACL: options.makePublic ? "public-read" : null
        };

        Object.keys(extraParams).forEach(extraKey => {
            // console.log("Setting extra S3 params:", extraKey, "to", extraParams[extraKey]);
            s3Params[extraKey] = extraParams[extraKey];
        });

        if (Object.keys(extraParams).length) {

            // console.log("Added extra s3 params to request: ", s3Params);
        }

        return this.s3Promise.then(s3 => {

            const request = s3.upload(s3Params);

            if (options.progressListener) {

                request["on"]("httpUploadProgress", (progressEvent) => {
                    options.progressListener(destination, progressEvent.loaded, progressEvent.total);

                });

            }

            return request.promise().then(data => {

                console.log(completeMessage);

                return this.scanFile(destination);

            });

        });
    }

    doUploadFile(file: File, destination: AnyFile, destinationFiles: ScannedFile[], options: WriteOptions):
        Promise<ScannedFile> {

        const existingFile = destinationFiles.find((f) => {
            return f.key === destination.key;
        });

        const skip = existingFile && !options.overwrite;

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
     * @param destinationFiles
     */
    uploadFile(file: File, destination: AnyFile, writeOptions?: WriteOptions, destinationFiles?: ScannedFile[]):
        Promise<ScannedFile> {

        writeOptions = writeOptions || {overwrite: false, makePublic: false};

        if (destinationFiles) {

            return this.doUploadFile(file, destination, destinationFiles, writeOptions);

        } else {

            return this.findDestinationFiles(writeOptions, destination).then(foundDestinationFiles => {

                return this.doUploadFile(file, destination, foundDestinationFiles, writeOptions);

            });

        }

    }

    /**
     * Upload files in the browser
     * @param parameters.inputList
     * @param parameters.destinationFolder
     * @param parameters.options
     */
    uploadFiles(parameters): Promise<ScannedFile[]> {
        const inputList = parameters.inputList;
        const destinationFolder = parameters.destinationFolder;
        let options = parameters.options;

        options = options || {makePublic: false, parallel: false, overwrite: false, skipSame: true};

        const sourceFiles = [];
        // Arrange input files into a regular array
        for (let ix = 0; ix < inputList.length; ix++) {

            const file = inputList.item(ix);
            sourceFiles.push(file);

        }

        return this.findDestinationFiles(options, destinationFolder).then(destinationFiles => {

            const processor = (inputFile: File) => {
                const key = `${destinationFolder.key}/${inputFile.name}`;

                const destinationFile: AnyFile = {
                    bucket: destinationFolder.bucket,
                    key
                };

                return this.uploadFile(inputFile, destinationFile, options, destinationFiles);

            };

            return this.process(sourceFiles, processor, options.parallel);

        });

    }

    ensureDirectoryExistence(filePath) {

        const dirname = path.dirname(filePath);
        if (this.directoryExists(dirname)) {
            return true;
        }
        this.ensureDirectoryExistence(dirname);
        fs.mkdirSync(dirname);
    }

    directoryExists(dirPath) {

        try {
            return fs.statSync(dirPath).isDirectory();
        } catch (err) {
            return false;
        }
    }

    /**
     * Checks if it exists and is a file
     * @param file
     */
    isFile(file: AnyFile): Promise<ScannedFile> {

        return this.list(file).then(files => {

            if (files.length) {

                return files.find(f => {

                    return f.key === file.key;
                });

            } else {

                return null;
            }
        });
    }

    readBlob(blob: Blob): Promise<string> {

        return new Promise((resolve, reject) => {

            const reader = new FileReader();
            reader.onload = (evt) => {
                const rangeString = evt.target["result"];
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
    async calculateUploadMD5(file: File): Promise<string> {

        const hash = createHash("md5");
        let currentIndex = 0;

        // Read 100kb at a time
        const delta = 1024 * 100;

        while (currentIndex >= file.size) {

            const nextIndex = Math.min(currentIndex + delta, file.size);

            const blob = file.slice(currentIndex, nextIndex);

            const sectionString = await this.readBlob(blob);

            hash.update(sectionString);
            currentIndex = nextIndex;

        }

        return hash.digest("hex");

    }

    calculateStreamMD5(stream: fs.ReadStream): Promise<string> {

        const hash = createHash("md5");

        return new Promise((resolve, reject) => {

            stream.on("data", (data) => {
                hash.update(data, "utf8");
            });

            stream.on("error", (err) => {
                console.log(err);
                reject(err);
            });

            stream.on("end", () => {

                const result = hash.digest("hex"); // e.g. 34f7a3113803f8ed3b8fd7ce5656ebec
                // console.log("Completed md5 calculation: ", result);
                resolve(result);

            });

        });

    }

    scanFile(file: AnyFile): Promise<ScannedFile> {

        if (file["md5"] && file["size"] && file["mimeType"]) {

            return new Promise((resolve, reject) => {
                const scannedFile = file as ScannedFile;
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

                        return {
                            key: file.key,
                            md5,
                            size: fileSize,
                            mimeType: getType(file.key)
                        } as ScannedFile;
                    });

                });
            }

        }

    }

    calculateLocalMD5(localPath: string): Promise<string> {
        // Once the file has been downloaded, calculate the checksum
        // console.log("Starting md5 calculation");

        const stream: fs.ReadStream = fs.createReadStream(localPath);

        return this.calculateStreamMD5(stream);

    }

    calculateLocalFileSize(localPath: string): Promise<number> {

        localPath = path.resolve(localPath);

        return this.promisify(fs.stat, localPath).then(stat => {
            return stat.size;
        });
    }

    /**
     * Read the contents of a file into a string
     * @param file {object} - The file to read
     */
    readString(file: AnyFile): Promise<string> {

        if (file.bucket) {

            return this.s3Promise.then(s3 => {

                return s3.getObject({Bucket: file.bucket, Key: file.key}).promise().then(data => {

                    return data.Body.toString();

                });
            });

        } else {
            // If it's a local file then read it from the local filesystem

            return this.promisify(fs.readFile, file.key).then(result => {

                return result.toString();
            });

        }

    }

    listAllFolders(folder: AnyFile, delimiter, token?: string): Promise<AnyFile[]> {

        return this.s3Promise.then(s3 => {
            return s3.listObjectsV2({
                Bucket: folder.bucket,
                Prefix: folder.key,
                Delimiter: delimiter,
                ContinuationToken: token
            }).promise().then(data => {
                const folders: AnyFile[] = data.CommonPrefixes.map(prefix => {
                    return {
                        bucket: folder.bucket,
                        key: prefix.Prefix
                    };
                });
                if (data.NextContinuationToken) {

                    return this.listAllFolders(folder, delimiter, data.NextContinuationToken).then(nextFolders => {
                        return folders.concat(nextFolders);
                    });

                } else {

                    return folders;
                }
            });

        });

    }

    listS3(bucket: string, prefix: string, delimiter?: string, token?: string): Promise<ScannedFile[]> {

        // console.log("Listing s3");
        return this.s3Promise.then(s3 => {

            return s3.listObjectsV2({
                Bucket: bucket,
                Prefix: prefix,
                Delimiter: delimiter,
                ContinuationToken: token
            }).promise().then(data => {

                // Add all the files to the items list
                let items: AnyFile[] = data.Contents.map(item => {
                    return {
                        bucket,
                        key: item.Key,
                        md5: JSON.parse(item.ETag),
                        size: item.Size,
                        mimeType: getType(item.Key)
                    };
                });

                if (data.NextContinuationToken) {

                    return this.listS3(bucket, prefix, delimiter, data.NextContinuationToken)
                        .then(resultItems => {

                        items = items.concat(resultItems);
                            return items as ScannedFile[];

                    });

                } else {

                    return items as ScannedFile[];
                }
            });

        });

    }

    scanLocalFile(filePath: string): Promise<ScannedFile> {

        return this.calculateLocalFileSize(filePath).then(fileSize => {

            return this.calculateLocalMD5(filePath).then(md5 => {

                return {
                    key: filePath,
                    md5,
                    size: fileSize,
                    mimeType: getType(filePath)
                };
            });

        });

    }

    // Find all the paths of all the local files
    doListLocal(dir: string): string[] {

        let results: string[] = [];

        try {
            const stat = fs.statSync(dir);
            if (stat && stat.isDirectory()) {
                const list = fs.readdirSync(dir);
                list.forEach((file) => {
                    file = path.resolve(dir, file);

                    const fileStat = fs.statSync(file);

                    if (fileStat && fileStat.isDirectory()) {

                        results = results.concat(this.doListLocal(file));
                    } else {

                        results.push(file);
                    }
                });

            } else if (stat && !stat.isDirectory()) {

                // Handle the case where it's just a file
                results.push(dir);
            }

        } catch (err) {

            // Assume that an error means the file/folder doesn't exist

        }

        return results;

    }

    listLocal(dir: string): Promise<ScannedFile[]> {

        try {

            dir = path.resolve(dir);

            const files = this.doListLocal(dir);

            const processor = (localFile: string) => {

                return this.scanLocalFile(localFile);
            };

            return this.process(files, processor, true);

        } catch (err) {

            console.log(err);

            return new Promise((resolve, reject) => {
                reject(err);
            });

        }

    }

    /**
     * Recursively list all the files in the dir
     * @param file {AnyFile}
     */
    list(file: AnyFile): Promise<ScannedFile[]> {
        // console.log("Listing files", JSON.stringify(file));
        file = this.fixFile(file);

        if (file.bucket) {
            // List s3

            return this.listS3(file.bucket, file.key);

        } else {

            return this.listLocal(file.key);

        }
    }

    locationsEqual(a: AnyFile, b: AnyFile): boolean {
        return ((!a.bucket && !b.bucket) || a.bucket === b.bucket) && a.key === b.key;
    }

    doSkip(source: ScannedFile, destination: AnyFile, existingFiles: ScannedFile[], options: WriteOptions): boolean {

        if (this.locationsEqual(source, destination)) {
            // Skip if the file is the same
            return true;
        }

        if (options.overwrite && !options.skipSame) {
            // Never skip when intending to overwrite and not skip same files
            return false;
        }

        // Find out if the key is the same
        return existingFiles.find( (existingFile) => {

            const sameFilename = existingFile.key === destination.key;

            const sameFile = existingFile.md5 === source.md5;

                return (sameFilename && !options.overwrite) || (sameFile && sameFilename);

            }) && true;

    }

    doCopyFile(sourceFile: ScannedFile, destination: AnyFile, destinationList: ScannedFile[], options: WriteOptions):
        Promise<AnyFile> {
        destination = this.fixFile(destination);

        const completeMessage = `Copied ${this.toFileString(sourceFile)} to ${this.toFileString(destination)}`;

        return this.s3Promise.then(s3 => {

            return new Promise<AnyFile>((resolve, reject) => {

                const skip = this.doSkip(sourceFile, destination, destinationList, options);
                options = options || {};

                if (!skip) {
                    if (sourceFile.bucket && destination.bucket) {
                        // Scenario 1: s3 to s3

                        options.s3Params = options.s3Params || {};

                        const copyObjectRequest = {
                            CopySource: `${sourceFile.bucket}/${sourceFile.key}`,
                            Bucket: destination.bucket,
                            Key: destination.key,
                            ACL: options.makePublic ? "public-read" : null
                        };

                        Object.keys(options.s3Params).forEach(extraKey => {
                            // console.log("Setting extra S3 params:", extraKey, "to", options.s3Params[extraKey]);
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
                        // Scenario 2: s3 to local

                        this.ensureDirectoryExistence(destination.key);

                        const file = fs.createWriteStream(destination.key);
                        const readStream = s3.getObject({Key: sourceFile.key, Bucket: sourceFile.bucket})
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
                        // Scenario 3: local to s3

                        const body = fs.createReadStream(sourceFile.key);

                        this.doWriteToS3(body, destination, options).then((dest) => {

                            resolve(dest);
                        }, err => {

                            console.log(err);
                            reject(err);
                        });

                    } else if (!sourceFile.bucket && !destination.bucket) {

                        // Scenario 4: local to local

                        this.ensureDirectoryExistence(destination.key);

                        const rd = fs.createReadStream(sourceFile.key);
                        rd.on("error", (err) => {
                            console.log(err);
                            reject(err);
                        });
                        const wr = fs.createWriteStream(destination.key);

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

    findDestinationFiles(options: WriteOptions, destinationDir: AnyFile): Promise<ScannedFile[]> {

        if (options.overwrite && !options.skipSame) {
            // Do not list files if overwriting and not skipping same files
            return new Promise((resolve, reject) => {
                resolve([]);
            });

        } else {

            return this.list(destinationDir);

        }

    }

    async doDeleteFile(file: AnyFile): Promise<AnyFile> {

        const completeMessage = `Deleted file ${this.toFileString(file)}`;

        if (file.bucket) {
            // Delete S3

            const s3 = await this.s3Promise;
            await s3.deleteObject({Bucket: file.bucket, Key: file.key}).promise();
            console.log(completeMessage);

        } else {
            // Delete local file
            unlinkSync(file.key);
        }

        return file;

    }

    /**
     * Delete all files in the folder
     * @param file
     * @param parallel
     */
    deleteAll(file: AnyFile, parallel?: boolean): Promise<AnyFile[]> {

        return this.list(file).then(files => {

            // console.log("Deleting files", JSON.stringify(files));
            const processor = (inputFile: AnyFile) => {
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
    copy(source: AnyFile, destination: AnyFile, options?: WriteOptions): Promise<ScannedFile[]> {

        options = options || {makePublic: false, parallel: false, overwrite: false, skipSame: true};

        // Fix file paths if they are local
        if (!source.bucket) {
            source.key = path.resolve(source.key);
        }

        if (!destination.bucket) {
            destination.key = path.resolve(destination.key);
        }

        // Recursively list all the source files
        return this.list(source).then(sourceFiles => {

            return this.findDestinationFiles(options, destination).then(destinationFiles => {

                const sourceFolderPath = source.key;
                const destinationFolderPath = destination.key;

                const processor = (inputFile: ScannedFile) => {

                    const destinationKey = inputFile.key.replace(sourceFolderPath, destinationFolderPath);
                    let destinationFile: ScannedFile = {
                        bucket: destination.bucket,
                        key: destinationKey,
                        md5: inputFile.md5,
                        size: inputFile.size,
                        mimeType: getType(destinationKey)
                    };

                    destinationFile = this.fixFile(destinationFile);

                    return this.doCopyFile(inputFile, destinationFile, destinationFiles, options);

                };

                return this.process(sourceFiles, processor, options.parallel) as Promise<ScannedFile[]>;

            });

        });

    }

    toFileString(file: AnyFile): string {

        return (file.bucket || "") + "/" + file.key;
    }

    /**
     * Write data to a file
     * @param body {string | fs.ReadStream} - The data to write
     * @param file {object} - The destination file to write
     * @param options {object} - The optional set of write parameters
     */
    write(body: string | fs.ReadStream, file: AnyFile, options?: WriteOptions): Promise<ScannedFile> {
        options = options || {makePublic: false, parallel: false, overwrite: true, skipSame: true};

        return this.isFile(file).then(isFile => {

            if (!options.overwrite && isFile) {

                console.log("Skipping writing existing file", this.toFileString(isFile));
                return isFile;

            } else {

                if (file.bucket) {

                    return this.doWriteToS3(body, file, options);

                } else {

                    // console.log("Writing string to", file.key);

                    return new Promise<ScannedFile>((resolve, reject) => {

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

                                    }, error => {

                                        reject(error);
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
