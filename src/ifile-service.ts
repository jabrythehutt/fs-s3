import {AnyFile} from "./any-file";
import {WriteOptions} from "./write-options";
import {ScannedFile} from "./scanned-file";
import * as fs from "fs";


/**
 * Created by djabry on 15/06/2016.
 */
export interface IFileService {

    /**
     * Read the contents of a file into a string
     * @param file {AnyFile} - The file to read
     */
    readString(file:AnyFile):Promise<string>;

    /**
     * Write data to a file
     * @param body {string | fs.ReadStream} - The data to write
     * @param file {AnyFile} - The destination file to write
     * @param options {WriteOptions} - The optional set of write parameters
     */
    write(body:string | fs.ReadStream, file:AnyFile, options?:WriteOptions):Promise<ScannedFile>;

    /**
     * Copy all file/s from one location to another
     *
     * @param source {AnyFile} - The source file or directory
     * @param destination {AnyFile} - The destination file or directory
     * @param options {WriteOptions} - The optional set of write parameters
     */
    copy(source:AnyFile, destination:AnyFile, options?:WriteOptions):Promise<ScannedFile[]>;

    /**
     * Recursively list all the files in the dir
     * @param dir {AnyFile} - The file or directory to scan
     */
    list(dir:AnyFile):Promise<ScannedFile[]>

    /**
     * Retrieve a link for getting a file
     * @param file {ScannedFile} - The file to get the link for
     */
    getReadURL(file:ScannedFile):Promise<string>;

    /**
     * Delete all files in the folder
     * @param file {AnyFile} - The file or directory to delete
     * @param parallel {boolean} - Whether to delete files in parallel
     */
    deleteAll(file:AnyFile, parallel?:boolean):Promise<AnyFile[]>;


    /**
     * Checks if it exists and is a file
     * @param file {AnyFile} - The combination of path/key and/or bucket to check
     */
    isFile(file:AnyFile):Promise<ScannedFile>;


    /**
     * Waits for a file to be written
     * @param file {AnyFile} - The file to wait for
     */
    waitForFile(file:AnyFile):Promise<ScannedFile>;


    /**
     * Upload files in the browser
     * @param files {FileList} - The file list to upload
     * @param destinationFolder {AnyFile} - The destination folder
     * @param writeOptions {WriteOptions} - The write options to use when writing the files
     */
    uploadFiles(files:FileList, destinationFolder:AnyFile, writeOptions?:WriteOptions):Promise<ScannedFile[]>;

    /**
     * Calculate the MD5 checksum of a browser file
     * @param file {File}
     * @returns {Promise<string>}
     */
    calculateUploadMD5(file:File):Promise<string>;

    /**
     *  Upload a single file from the browser
     * @param file {File} - The file to upload
     * @param destination {AnyFile} - The destination to upload the file to
     * @param writeOptions {AnyFile} - The options to use when writing the file
     */
    uploadFile(file:File, destination:AnyFile, writeOptions?:WriteOptions):Promise<ScannedFile>;

}