import {
    ReadStream
} from "fs";
import {createHash} from "crypto";
import {IFileService} from "./ifile-service";
import {ScannedFile, AnyFile, WriteOptions, S3File} from "./api";
import {NodeFileService} from "./node/node-file-service";

export class FileService extends NodeFileService implements IFileService {

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

    readBlob(blob: Blob): Promise<string> {

        return new Promise<string>((resolve, reject) => {

            const reader = new FileReader();
            reader.onload = (evt) => {
                const rangeString = (evt.target as any).result;
                resolve(rangeString);
            };

            reader.onerror = (err) => {
                reject(err);
            };

            reader.readAsBinaryString(blob);

        });

    }

    /**
     * Calculate the MD5 checksum of a browser file
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


}
