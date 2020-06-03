import {getType} from "mime";
import {
    copyFileSync,
    createReadStream,
    existsSync,
    readdirSync,
    readFileSync,
    ReadStream,
    statSync,
    unlinkSync,
    writeFileSync
} from "fs";
import {createHash} from "crypto";
import {normalize, parse, resolve as resolvePath, sep} from "path";
import mkdirp from "mkdirp";
import {S3FileService} from "../s3/s3-file-service";
import {AnyFile, S3File, ScannedFile, WriteOptions} from "../api";
import {LocalFile} from "../api/local-file";
import {Scanned} from "../api/scanned";

export class NodeFileService extends S3FileService {

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

    async waitForLocalFile(filePath: string): Promise<void> {
        while (!existsSync(filePath)) {
            await this.sleep(100);
        }
    }

    /**
     * Waits for a file to be written
     * @param file {object} - The file to wait for
     */
    async waitForFile<T extends LocalFile>(file: T): Promise<Scanned<T>> {
        if (this.isS3File(file)) {
            return this.waitForS3File(this.toS3File(file));
        } else {
            await this.waitForLocalFile(file.key);
            return this.scanFile(file);
        }
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

    calculateStreamMD5(stream: ReadStream): Promise<string> {
        const hash = createHash("md5");
        return new Promise((resolve, reject) => {
            stream.on("data", (data) => {
                hash.update(data, "utf8");
            });

            stream.on("error", (err) => {
                reject(err);
            });

            stream.on("end", () => {
                const result = hash.digest("hex");
                resolve(result);
            });
        });

    }

    async scanFile<T extends LocalFile>(file: T | Scanned<T>): Promise<Scanned<T> | undefined> {
        const scannedFile = file as ScannedFile;
        if(scannedFile.md5) {
            return scannedFile as Scanned<T>;
        }
        if (this.isS3File(file)) {
            const s3File = this.toS3File(file);
            const scannedS3File = await this.scanS3File(s3File);
            return scannedS3File as Scanned<T>;
        } else {
            const scannedLocalFile = await this.scanLocalFile(file.key);
            return scannedLocalFile as Scanned<T>;
        }
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
        if (this.isS3File(file)) {
            return this.readS3String(this.toS3File(file));
        } else {
            // If it's a local file then read it from the local filesystem
            return readFileSync(file.key).toString();
        }
    }

    async scanLocalFile(filePath: string): Promise<Scanned<LocalFile>> {
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
            throw err;
        }

    }

    /**
     * Recursively list all the files in the dir
     * @param file {AnyFile}
     */
    list(file: AnyFile): Promise<ScannedFile[]> {
        return this.isS3File(file) ? this.listS3Files(this.toS3File(file)) : this.listLocal(file.key);
    }

    locationsEqual(a: AnyFile, b: AnyFile): boolean {
        return ((!a.bucket && !b.bucket) || a.bucket === b.bucket) && a.key === b.key;
    }

    async doCopyFile(sourceFile: ScannedFile,
                     destination: AnyFile,
                     destinationList: ScannedFile[],
                     options: WriteOptions): Promise<AnyFile> {

        const skip = this.doSkip(sourceFile, destination, destinationList, options);
        options = options || {};

        if (!skip) {
            if (this.isS3File(sourceFile) && this.isS3File(destination)) {
                // Scenario 1: s3 to s3
                await this.copyS3Object({
                    source: this.toS3File(sourceFile),
                    destination: this.toS3File(destination)
                }, options);

                return destination;

            } else if (sourceFile.bucket && !destination.bucket) {
                // Scenario 2: s3 to local
                await this.ensureDirectoryExistence(destination.key);
                const s3Object = await this.getObject(this.toS3File(sourceFile));
                writeFileSync(destination.key, s3Object.Body);
                return destination;

            } else if (!sourceFile.bucket && destination.bucket) {

                // Scenario 3: local to s3
                const body = createReadStream(sourceFile.key);
                return this.writeToS3(body, this.toS3File(destination), options);

            } else if (!sourceFile.bucket && !destination.bucket) {

                // Scenario 4: local to local
                await this.ensureDirectoryExistence(destination.key);
                copyFileSync(sourceFile.key, destination.key);
            }

        } else {

            return destination;
        }

    }

    async findDestinationFiles(options: WriteOptions, destinationDir: AnyFile): Promise<ScannedFile[]> {
        // Don't bother finding destination files if they'll all be overwritten anyway
        return options.overwrite && !options.skipSame ? [] : this.list(destinationDir);

    }

    protected async doDeleteFile<T extends LocalFile>(file: T): Promise<T> {
        if (this.isS3File(file)) {
            const s3File = this.toS3File(file);
            await this.deleteObject(s3File);
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
    async deleteAll<T extends LocalFile>(file: T, parallel?: boolean): Promise<Scanned<T>[]> {

        const files = await this.list(file);
        const processor = (inputFile: T) => {
            return this.doDeleteFile(inputFile);
        };
        return this.process(files, processor, parallel);
    }

    isS3File(input: AnyFile): boolean {
        return !!(input as S3File).bucket;
    }

    parseSeps(s3Key: string): string {
        return s3Key.split("/").join(sep);
    }

    toLocalFile<T extends LocalFile>(file: AnyFile): T {
        return this.isS3File(file) ? file as T : {
            ...file,
            key: normalize(this.parseSeps(file.key))
        } as T;
    }

    toS3File<T extends S3File>(destination: AnyFile): T {
        return this.isS3File(destination) ? {
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
    async copy<I extends LocalFile, O extends LocalFile>(source: I, destination: O, options?: WriteOptions):
        Promise<Scanned<O>[]> {

        options = options || {makePublic: false, parallel: false, overwrite: false, skipSame: true};

        // Fix file paths if they are local
        if (!this.isS3File(source)) {
            source = this.toLocalFile(source);
        }

        if (!this.isS3File(destination)) {
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


    /**
     * Write data to a file
     * @param body {string | ReadStream} - The data to write
     * @param file {AnyFile} - The destination file to write
     * @param [options] {WriteOptions} - The optional set of write parameters
     */
    async write<T extends LocalFile>(body: string | ReadStream, file: T, options?: WriteOptions): Promise<Scanned<T>> {
        options = options || {makePublic: false, parallel: false, overwrite: true, skipSame: true};
        const isFile = await this.isFile(file);
        if (!options.overwrite && isFile) {
            return isFile;
        } else {
            const s3File = this.toS3File(file);
            if (s3File.bucket) {
                return this.writeToS3(body, s3File, options);
            } else {
                await this.ensureDirectoryExistence(file.key);
                writeFileSync(file.key, body);
                return this.scanFile(file);
            }
        }
    }


}
