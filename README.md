[![CircleCI](https://circleci.com/gh/djabry/fs-s3.svg?style=svg)](https://circleci.com/gh/djabry/fs-s3)
#Yet another S3 wrapper

I often find myself reinventing the wheel when using the AWS SDK for S3 browser and node-based operations.

Copying and deleting multiple files just requires too much boilerplate code and existing efforts (such as [node-s3-client](https://github.com/andrewrk/node-s3-client)) have either been abandoned, do not support promises or only work for Node.

If you like promises then this could be yet another S3 wrapper for you.

## Usage

1. Install it 
    
    ```shell
    npm install --save @djabry/fs-s3
    ```

2. Import the script

    * Node or browser with modern build system

        ES6 or TypeScript: 
         ```javascript
         import * as fss3 from '@djabry/fs-s3';
         ```

        or

        Standard:
         ```javascript
         var fss3 = require("@djabry/fs-s3");
         ```

    * Simple browser

         ```html
         <script src="node_modules/@djabry/fs-s3/dist/fs-s3-standalone.min.js"></script>
         ```

3. Create a new FileService object

 ```javascript
   //Create a new S3 object
   var s3 = new AWS.S3({region:"eu-west-1"});
       
   //The file service takes the S3 object as the argument constructor
   var fileService = new fss3.FileService(s3);
 ```
    
## Examples

### Live example
Try listing files and uploading into your S3 bucket [here](https://djabry.github.io/fs-s3).

### Write data to a file

```javascript
//A very important message
var importantMessage = "Don't drink and derive";

//Write the important message to S3
fileService.write(importantMessage, {bucket:"my-bucket",key:"messages/important.txt"});

//Write it to my desktop
fileService.write(importantMessage, {key:"/Users/djabry/Desktop/important.txt"});

//Write it to a new folder on my desktop
fileService.write(importantMessage, {key:"/Users/djabry/Desktop/must_read/important.txt"});
```

### Copy files

``` javascript
//Copy all the files from my desktop to S3
fileService.copy({key:"/Users/djabry/Desktop"}, {bucket:"my-bucket", key:"my-files"})
    .then(function(writtenFiles){
        console.log("Successfully written",writtenFiles.length,"files");
    });
```

    
## API

### AnyFile

This describes a file or directory on the local file system or on S3.

```typescript
export interface AnyFile {
    bucket?:string; //The S3 bucket of the file or left out if a local file
    key:string; //The path to the local file or the s3 key
}
```

### ScannedFile

This is emitted when a file is scanned. It contains the same fields as an AnyFile along with the hash of the file content.

```typescript
export interface ScannedFile extends AnyFile {
    md5:string; //The md5 hash of the file content
    size:number; //The size of the file in bytes
    mimeType:string; //The mime type of the file
}
```

### WriteOptions

These are the options used when writing files.

```typescript
export interface WriteOptions {
    skipSame?:boolean; //Skip writing files with the same md5 hash
    overwrite?:boolean; //Overwrite files with the same key/path
    parallel?:boolean; //Perform multiple write operations in parallel
    makePublic?:boolean; //Make the object public (if writing to S3)
    s3Params?:{[key:string]:any}; //Custom s3 params to include in the write request (if writing to s3)
}
```

### FileService

These are the operations that the file service can perform.

```typescript
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
```
