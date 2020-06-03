import {getType} from "mime";
import {
    createReadStream,
    createWriteStream,
    existsSync,
    readdirSync,
    readFileSync,
    ReadStream,
    statSync,
    unlinkSync,
    writeFileSync
} from "fs";
import {createHash} from "crypto";
import {IFileService} from "./ifile-service";
import {ScannedFile, AnyFile, WriteOptions, S3File} from "./api";
import {parse, resolve as resolvePath, sep} from "path";
import mkdirp from "mkdirp";
import {S3FileService} from "./s3/s3-file-service";

export class FileService extends S3FileService implements IFileService {

    protected async processInSeries<A, B>(inputElements: A[], processor: (element: A) => Promise<B>): Promise<B[]> {
        const results = [];
        for (const element of inputElements) {
            results.push(await processor(element));
        }
        return results;
    }

    /**
     * Execute promises in series or parallel
     */
    async process<A, B>(inputElements: A[], processor: (element: A) => Promise<B>, parallel: boolean): Promise<B[]> {
        return parallel ? Promise.all(inputElements.map(el => processor(el))) :
            this.processInSeries<A, B>(inputElements, processor);
    }

    async sleep(period: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, period));
    }

    /**
     * Waits for a file to be written
     * @param file {object} - The file to wait for
     */
    async waitForFile(file: AnyFile): Promise<ScannedFile> {
        if (file.bucket) {
            return this.waitForS3File(this.toS3File(file));

        } else {
            while (!existsSync(file.key)) {
                await this.sleep(100);
            }
            return this.scanFile(file);
        }
    }


    async doUploadFile(file: File, destination: AnyFile, existingFiles: ScannedFile[], options: WriteOptions):
        Promise<ScannedFile> {

        const existingFile = existingFiles.find((f) => {
            return f.key === destination.key;
        });
        const skip = existingFile && !options.overwrite;
        if (!skip) {
            (destination as ScannedFile).md5 = await this.calculateUploadMD5(file);
            return this.writeToS3(file, this.toS3File(destination), options);
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
    async uploadFile(file: File,
                     destination: AnyFile,
                     writeOptions: WriteOptions = {overwrite: false, makePublic: false},
                     destinationFiles?: ScannedFile[]): Promise<ScannedFile> {

        destinationFiles = destinationFiles || await this.findDestinationFiles(writeOptions, destination);
        return this.doUploadFile(file, destination, destinationFiles, writeOptions);

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
        const sourceFiles = [...inputList];
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

    async ensureDirectoryExistence(filePath: string): Promise<void> {
        const fileInfo = parse(filePath);
        await mkdirp(fileInfo.dir);
    }

    directoryExists(dirPath: string) {
        return existsSync(dirPath) && statSync(dirPath).isDirectory();
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
                const result = hash.digest("hex");
                resolve(result);
            });

        });

    }

    async scanFile(file: AnyFile | ScannedFile): Promise<ScannedFile> {
        const scannedFile = file as ScannedFile;
        if(scannedFile.md5) {
            return scannedFile;
        }
        return file.bucket ? this.scanS3File(this.toS3File(file)) : this.scanLocalFile(file.key);
    }

    private calculateLocalMD5(localPath: string): Promise<string> {
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
            return this.readS3String(this.toS3File(file));

        } else {
            // If it's a local file then read it from the local filesystem
            return readFileSync(file.key).toString();
        }

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

    flatten<T>(input: T[][]): T[] {
        return input.reduce((flatArray, array) => [...flatArray, ...array], []);
    }

    listFilesRecursively(directoryOrFilePath: string): string[] {
        if (existsSync(directoryOrFilePath)) {
            const fileInfo = statSync(directoryOrFilePath);
            if (fileInfo) {
                if (fileInfo.isDirectory()) {
                    const chunks = readdirSync(directoryOrFilePath)
                        .map(f => resolvePath(directoryOrFilePath, f))
                        .map(f => this.listFilesRecursively(f));
                    return this.flatten(chunks);
                } else if (fileInfo.isFile()) {
                    return [directoryOrFilePath];
                }
            }
        }
        return [];
    }

    async listLocal(dir: string): Promise<ScannedFile[]> {
        try {
            dir = resolvePath(dir);
            const files = this.listFilesRecursively(dir);
            return await this.process(files, f => this.scanLocalFile(f), true);

        } catch (err) {
            this.logger.error(err);
            throw err;
        }

    }

    /**
     * Recursively list all the files in the dir
     * @param file {AnyFile}
     */
    list(file: AnyFile): Promise<ScannedFile[]> {
        file = this.correctS3PathSeps(file);
        return file.bucket ? this.listS3Files(this.toS3File(file)) : this.listLocal(file.key);
    }

    locationsEqual(a: AnyFile, b: AnyFile): boolean {
        return ((!a.bucket && !b.bucket) || a.bucket === b.bucket) && a.key === b.key;
    }

    doSkip(source: ScannedFile, destination: AnyFile, existingFiles: ScannedFile[], options: WriteOptions): boolean {

        if (this.locationsEqual(source, destination)) {
            // Don't proceed if attempting to write a file over itself
            return true;
        }

        if (options.overwrite && !options.skipSame) {
            // Never skip when intending to overwrite and not skip same files
            return false;
        }

        // Don't bother overwriting files if the content is the same
        return !!existingFiles.find((existingFile) => {
            const samePath = existingFile.key === destination.key;
            const sameContent = existingFile.md5 === source.md5;
            return (samePath && !options.overwrite) || (sameContent && samePath);
        });

    }

    async doCopyFile(sourceFile: ScannedFile,
                     destination: AnyFile,
                     destinationList: ScannedFile[],
                     options: WriteOptions): Promise<AnyFile> {
        destination = this.correctS3PathSeps(destination);

        const completeMessage = `Copied ${this.toLocationString(sourceFile)} to ${this.toLocationString(destination)}`;
        const s3 = await this.s3Promise;

        const skip = this.doSkip(sourceFile, destination, destinationList, options);
        options = options || {};

        if (!skip) {
            if (sourceFile.bucket && destination.bucket) {
                // Scenario 1: s3 to s3
                await this.copyS3Object({
                    source: this.toS3File(sourceFile),
                    destination: this.toS3File(destination)
                }, options);

                this.logger.debug(completeMessage);
                return destination;

            } else if (sourceFile.bucket && !destination.bucket) {
                // Scenario 2: s3 to local
                await this.ensureDirectoryExistence(destination.key);
                const file = createWriteStream(destination.key);
                const readStream = s3.getObject({Key: sourceFile.key, Bucket: sourceFile.bucket})
                    .createReadStream();
                return new Promise<AnyFile>((resolve, reject) => {
                    file.on("error", (err) => {
                        this.logger.error(err);
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
                return this.writeToS3(body, this.toS3File(destination), options);

            } else if (!sourceFile.bucket && !destination.bucket) {

                // Scenario 4: local to local
                await this.ensureDirectoryExistence(destination.key);
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

            this.logger.debug(`Skipping existing file: ${this.toLocationString(destination)}`);
            return destination;
        }

    }

    async findDestinationFiles(options: WriteOptions, destinationDir: AnyFile): Promise<ScannedFile[]> {
        // Don't bother finding destination files if they'll all be overwritten anyway
        return options.overwrite && !options.skipSame ? [] : this.list(destinationDir);

    }

    async doDeleteFile(file: AnyFile): Promise<AnyFile> {

        const completeMessage = `Deleted file ${this.toLocationString(file)}`;

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

    correctS3PathSeps<T extends S3File>(destination: AnyFile): T {
        return destination.bucket ? {
            ...destination,
            key: this.toS3Key(destination.key)
        } as T : destination as T;
    }

    replacePathSepsWithForwardSlashes(input: string): string {
        return input.split(sep).join("/");
    }

    stripPrefixSlash(input: string): string {
        return input.startsWith("/") ? input.replace("/", "") : input;
    }

    toS3Key(input: string): string {
        return this.stripPrefixSlash(this.replacePathSepsWithForwardSlashes(input));
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

        const processor = async (inputFile: ScannedFile) => {

            const destinationKey = inputFile.key.replace(sourceFolderPath, destinationFolderPath);
            const destinationFile: ScannedFile = {
                bucket: destination.bucket,
                key: destinationKey,
                md5: inputFile.md5,
                size: inputFile.size,
                mimeType: getType(destinationKey)
            };
            await this.doCopyFile(inputFile, destinationFile, destinationFiles, options);
            return destinationFile;

        };

        return await this.process(sourceFiles, processor, options.parallel);

    }

    toS3File<T extends S3File>(file: AnyFile): T {
        return this.correctS3PathSeps(file)
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
            this.logger.debug(`Skipping writing existing file: ${this.toLocationString(isFile)}`);
            return isFile;
        } else {
            if (file.bucket) {
                return this.writeToS3(body, this.toS3File(file), options);
            } else {
                await this.ensureDirectoryExistence(file.key);
                writeFileSync(file.key, body);
                return this.scanFile(file);
            }
        }
    }


}
