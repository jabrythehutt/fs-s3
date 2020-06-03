import {getType} from "mime";
import {
    createReadStream,
    createWriteStream,
    mkdirSync,
    readdirSync,
    readFileSync,
    ReadStream,
    statSync,
    unlinkSync,
    writeFileSync
} from "fs";
import {createHash} from "crypto";
import {IFileService} from "./ifile-service";
import {ScannedFile} from "./scanned-file";
import {AnyFile} from "./any-file";
import {WriteOptions} from "./write-options";
import S3 from "aws-sdk/clients/s3";
import {dirname, resolve as resolvePath} from "path";
import {NoOpLogger} from "./no.op.logger";
import {Logger} from "./logger";
import {FsError} from "./fs.error";

export class FileService implements IFileService {
    s3Promise: Promise<S3>;

    /**
     *
     * @param s3 - {S3 | Promise<S3>} Either an s3 object or a promise of one
     * @param [logger] - Optional logger to use
     */
    constructor(s3: S3 | Promise<S3>, public logger: Logger = new NoOpLogger()) {
        if (typeof s3["then"] === "function") {
            this.s3Promise = s3 as Promise<S3>;
        } else {
            this.s3Promise = Promise.resolve(s3);
        }

    }

    async getReadURL(file: ScannedFile, expires?: number): Promise<string> {

        // Create a link that lasts for 24h by default
        expires = expires || 60 * 60 * 24;
        const s3 = await this.s3Promise;

        if (file.bucket) {
            return new Promise<string>((resolve, reject) => {
                s3.getSignedUrl("getObject", {Bucket: file.bucket, Key: file.key, Expires: expires}, (err, url) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(url);
                    }
                });

            });
        } else {

            throw new Error(FsError.LocalLink);

        }

    }

    /**
     * Execute promises in series or parallel
     */
    process<A, B>(inputElements: A[], processor: (element: A) => Promise<B>, parallel: boolean): Promise<B[]> {

        if (parallel) {

            // Process all in parallel
            const outputPromises: Promise<B>[] = inputElements.map(inputElement => {
                return processor(inputElement);
            });

            // es6-shim typings don't seem to be correct so need to do this workaround for Promise.all
            return Promise.all(outputPromises).then((results: any) => {

                return results as B[];
            });

        } else {

            // Otherwise do in series
            let promise: Promise<B[]> = Promise.resolve([] as B[]);

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

    /**
     * Waits for a file to be written
     * @param file {object} - The file to wait for
     */
    async waitForFile(file: AnyFile): Promise<ScannedFile> {
        if (!file.bucket) {
            // Local wait is not supported yet
            throw new Error(FsError.LocalFileWait);
        } else {
            const s3 = await this.s3Promise;
            await s3.waitFor("objectExists", {Bucket: file.bucket, Key: file.key}).promise();
            return this.isFile(file);
        }
    }

    fixFile<T extends AnyFile>(destination: T): T {

        if (destination.bucket) {
            // Replace any back slashes with forward slashes in case using windows
            destination.key = destination.key.replace(/\\/g, "/");

            // Remove any prefix forward slashes

            if (destination.key.startsWith("/")) {
                destination.key = destination.key.replace("/", "");
            }

        }

        return destination;

    }

    async doWriteToS3(body, destination: AnyFile, options: WriteOptions): Promise<ScannedFile> {

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
            ACL: options.makePublic ? "public-read" : null,
            ...extraParams
        };
        const s3 = await this.s3Promise;
        await new Promise((resolve, reject) => {
            const request = s3.upload(s3Params);
            request.on("httpUploadProgress", (progressEvent) => {
                if (options.progressListener) {
                    options.progressListener(destination, progressEvent.loaded, progressEvent.total);
                }
            }).send((err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
        this.logger.debug(completeMessage);
        return this.scanFile(destination);

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
    async uploadFiles(parameters): Promise<ScannedFile[]> {
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

        const destinationFiles = await this.findDestinationFiles(options, destinationFolder);
        const processor = (inputFile: File) => {
            const key = `${destinationFolder.key}/${inputFile.name}`;

            const destinationFile: AnyFile = {
                bucket: destinationFolder.bucket,
                key
            };

            return this.uploadFile(inputFile, destinationFile, options, destinationFiles);

        };

        return this.process(sourceFiles, processor, options.parallel);

    }

    ensureDirectoryExistence(filePath) {

        const dir = dirname(filePath);
        if (this.directoryExists(dir)) {
            return true;
        }
        this.ensureDirectoryExistence(dir);
        mkdirSync(dir);
    }

    directoryExists(dirPath) {

        try {
            return statSync(dirPath).isDirectory();
        } catch (err) {
            return false;
        }
    }

    /**
     * Checks if it exists and is a file
     * @param file
     */
    async isFile(file: AnyFile): Promise<ScannedFile> {

        const files = await this.list(file);
        if (files.length) {
            return files.find(f => {
                return f.key === file.key;
            });

        } else {

            return null;
        }
    }

    readBlob(blob: Blob): Promise<string> {

        return new Promise<string>((resolve, reject) => {

            const reader = new FileReader();
            reader.onload = (evt) => {
                const rangeString = (evt.target as any).result;
                resolve(rangeString);
            };

            reader.onerror = (err) => {

                this.logger.error(err.toString());
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

    calculateStreamMD5(stream: ReadStream): Promise<string> {

        const hash = createHash("md5");

        return new Promise((resolve, reject) => {

            stream.on("data", (data) => {
                hash.update(data, "utf8");
            });

            stream.on("error", (err) => {
                this.logger.error(err);
                reject(err);
            });

            stream.on("end", () => {

                const result = hash.digest("hex"); // e.g. 34f7a3113803f8ed3b8fd7ce5656ebec
                // this.logger.debug( "Completed md5 calculation: ", result);
                resolve(result);

            });

        });

    }

    async scanFile(file: AnyFile): Promise<ScannedFile> {

        if (file["md5"] && file["size"] && file["mimeType"]) {

            return file as ScannedFile;

        } else {

            if (file.bucket) {

                const files = await this.listS3(file.bucket, file.key);
                return files[0];

            } else {

                const md5 = await this.calculateLocalMD5(file.key);
                const fileSize = await this.calculateLocalFileSize(file.key);

                return {
                    key: file.key,
                    md5,
                    size: fileSize,
                    mimeType: getType(file.key)
                } as ScannedFile;
            }

        }

    }

    calculateLocalMD5(localPath: string): Promise<string> {
        // Once the file has been downloaded, calculate the checksum
        // this.logger.debug( "Starting md5 calculation");

        const stream: ReadStream = createReadStream(localPath);
        return this.calculateStreamMD5(stream);

    }

    async calculateLocalFileSize(localPath: string): Promise<number> {
        localPath = resolvePath(localPath);
        const fileStats = statSync(localPath);
        return fileStats.size;
    }

    /**
     * Read the contents of a file into a string
     * @param file {object} - The file to read
     */
    async readString(file: AnyFile): Promise<string> {

        if (file.bucket) {
            const s3 = await this.s3Promise;
            const data = await s3.getObject({Bucket: file.bucket, Key: file.key}).promise();
            return data.Body.toString();

        } else {
            // If it's a local file then read it from the local filesystem
            return readFileSync(file.key).toString();
        }

    }

    async listAllFolders(folder: AnyFile, delimiter): Promise<AnyFile[]> {
        const s3 = await this.s3Promise;
        const listRequest = {
            Bucket: folder.bucket,
            Prefix: folder.key,
            Delimiter: delimiter,
            ContinuationToken: null
        };
        let data = await s3.listObjectsV2(listRequest).promise();
        const folders: AnyFile[] = data.CommonPrefixes.map(prefix => {
            return {
                bucket: folder.bucket,
                key: prefix.Prefix
            };
        });

        while (data.NextContinuationToken) {
            listRequest.ContinuationToken = data.NextContinuationToken;
            data = await s3.listObjectsV2(listRequest).promise();
            folders.push(...data.CommonPrefixes.map(prefix => {
                return {
                    bucket: folder.bucket,
                    key: prefix.Prefix
                };
            }));
        }

        return folders;
    }

    toScannedFile(bucket: string, item: S3.Object): ScannedFile {
        return {
            bucket,
            key: item.Key,
            md5: JSON.parse(item.ETag),
            size: item.Size,
            mimeType: getType(item.Key)
        };
    }

    async listS3(bucket: string, prefix: string, delimiter?: string): Promise<ScannedFile[]> {
        const s3 = await this.s3Promise;
        const listRequest = {
            Bucket: bucket,
            Prefix: prefix,
            Delimiter: delimiter,
            ContinuationToken: null
        };

        let data = await s3.listObjectsV2(listRequest).promise();
        const items = data.Contents.map(item => this.toScannedFile(bucket, item));

        while (data.NextContinuationToken) {
            listRequest.ContinuationToken = data.NextContinuationToken;
            data = await s3.listObjectsV2(listRequest).promise();
            items.push(...data.Contents.map(item => this.toScannedFile(bucket, item)));
        }

        return items.filter((item, index, arr) =>
            !item.key.endsWith("/") && !this.isContainingFolder(item, arr));

    }

    async scanLocalFile(filePath: string): Promise<ScannedFile> {
        const fileSize = await this.calculateLocalFileSize(filePath);
        const md5 = await this.calculateLocalMD5(filePath);
        return {
            key: filePath,
            md5,
            size: fileSize,
            mimeType: getType(filePath)
        };

    }

    // Find all the paths of all the local files
    doListLocal(dir: string): string[] {

        let results: string[] = [];

        try {
            const fileStats = statSync(dir);
            if (fileStats && fileStats.isDirectory()) {
                const list = readdirSync(dir);
                list.forEach((file) => {
                    file = resolvePath(dir, file);

                    const fileStat = statSync(file);

                    if (fileStat && fileStat.isDirectory()) {

                        results = results.concat(this.doListLocal(file));
                    } else {

                        results.push(file);
                    }
                });

            } else if (fileStats && !fileStats.isDirectory()) {

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

            dir = resolvePath(dir);

            const files = this.doListLocal(dir);

            const processor = (localFile: string) => {

                return this.scanLocalFile(localFile);
            };

            return this.process(files, processor, true);

        } catch (err) {

            this.logger.debug( err);

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

    async doCopyFile(sourceFile: ScannedFile, destination: AnyFile,
                     destinationList: ScannedFile[], options: WriteOptions): Promise<AnyFile> {
        destination = this.fixFile(destination);

        const completeMessage = `Copied ${this.toFileString(sourceFile)} to ${this.toFileString(destination)}`;
        const s3 = await this.s3Promise;

        const skip = this.doSkip(sourceFile, destination, destinationList, options);
        options = options || {};

        if (!skip) {
            if (sourceFile.bucket && destination.bucket) {
                // Scenario 1: s3 to s3

                const extraParams = options.s3Params || {};

                const copyObjectRequest = {
                    CopySource: `${sourceFile.bucket}/${sourceFile.key}`,
                    Bucket: destination.bucket,
                    Key: destination.key,
                    ACL: options.makePublic ? "public-read" : null,
                    ...extraParams
                };

                await s3.copyObject(copyObjectRequest).promise();
                this.logger.debug(completeMessage);

            } else if (sourceFile.bucket && !destination.bucket) {
                // Scenario 2: s3 to local
                this.ensureDirectoryExistence(destination.key);
                const file = createWriteStream(destination.key);
                const readStream = s3.getObject({Key: sourceFile.key, Bucket: sourceFile.bucket})
                    .createReadStream();
                return new Promise<AnyFile>((resolve, reject) => {
                    file.on("error", (err) => {
                        this.logger.error( err);
                        reject(err);
                    });

                    file.on("close", (ex) => {
                        this.logger.debug(completeMessage);
                        resolve(destination);
                    });
                    readStream.pipe(file);
                });

            } else if (!sourceFile.bucket && destination.bucket) {
                // Scenario 3: local to s3
                const body = createReadStream(sourceFile.key);
                return this.doWriteToS3(body, destination, options);

            } else if (!sourceFile.bucket && !destination.bucket) {

                // Scenario 4: local to local

                this.ensureDirectoryExistence(destination.key);
                const rd = createReadStream(sourceFile.key);

                return new Promise<AnyFile>((resolve, reject) => {
                    rd.on("error", (err) => {
                        this.logger.error(err);
                        reject(err);
                    });
                    const wr = createWriteStream(destination.key);

                    wr.on("error", (err) => {
                        this.logger.error(err);
                        reject(err);
                    });
                    wr.on("close", (ex) => {
                        this.logger.debug(completeMessage);
                        resolve(destination);
                    });
                    rd.pipe(wr);
                });

            }

        } else {

            this.logger.debug( `Skipping existing file: ${this.toFileString(destination)}`);
            return destination;
        }

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
            this.logger.debug(completeMessage);

        } else {
            // Delete local file
            unlinkSync(file.key);
        }

        return file;

    }

    /**
     * Delete all files in the folder
     * @param file {AnyFile} The file/folder to delete
     * @param [parallel] {boolean}
     */
    async deleteAll(file: AnyFile, parallel?: boolean): Promise<AnyFile[]> {

        const files = await this.list(file);
        const processor = (inputFile: AnyFile) => {
            return this.doDeleteFile(inputFile);
        };

        return this.process(files, processor, parallel);
    }

    /**
     * Copy all file/s from one location to another
     *
     * @param source {AnyFile} - The source file or directory
     * @param destination {AnyFile} - The destination file or directory
     * @param [options] {WriteOptions} - The optional set of write parameters
     */
    async copy(source: AnyFile, destination: AnyFile, options?: WriteOptions): Promise<ScannedFile[]> {

        options = options || {makePublic: false, parallel: false, overwrite: false, skipSame: true};

        // Fix file paths if they are local
        if (!source.bucket) {
            source.key = resolvePath(source.key);
        }

        if (!destination.bucket) {
            destination.key = resolvePath(destination.key);
        }

        const sourceFiles = await this.list(source);
        const destinationFiles = await this.findDestinationFiles(options, destination);
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

    }

    toFileString(file: AnyFile): string {

        return (file.bucket || "") + "/" + file.key;
    }

    /**
     * Write data to a file
     * @param body {string | ReadStream} - The data to write
     * @param file {AnyFile} - The destination file to write
     * @param [options] {WriteOptions} - The optional set of write parameters
     */
    async write(body: string | ReadStream, file: AnyFile, options?: WriteOptions): Promise<ScannedFile> {
        options = options || {makePublic: false, parallel: false, overwrite: true, skipSame: true};
        const isFile = await this.isFile(file);
        if (!options.overwrite && isFile) {

            this.logger.debug( `Skipping writing existing file: ${this.toFileString(isFile)}`);
            return isFile;

        } else {

            if (file.bucket) {
                return this.doWriteToS3(body, file, options);
            } else {
                this.ensureDirectoryExistence(file.key);
                writeFileSync(file.key, body);
                return this.scanFile(file);

            }

        }
    }

    private isContainingFolder(file: ScannedFile, otherFiles: ScannedFile[]): boolean {
        const folderPrefix = `${file.key}/`;
        return !!otherFiles.find(f => f.key.startsWith(folderPrefix));
    }

}
