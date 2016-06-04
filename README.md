#Yet another S3 wrapper

I often find myself reinventing the wheel when using the AWS SDK for S3 operations in the browser and in Node.

Copying and deleting multiple files just requires too much boilerplate code and existing efforts (such as [node-s3-client](https://github.com/andrewrk/node-s3-client)) have either been abandoned, do not support promises or only work for Node.

If you like promises (not the Donald Trump variety, but the ES6y ones that tend to get resolved) then this could be yet another S3 wrapper for you.

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
         var fss3 = require("fs-s3");
         ```

    * Simple browser

         ```html
         <script src="node_modules/@djabry/fs-s3/dist/fs-s3-standalone.min.js"></script>
         ```

3. Create a new FileService object

    ```javascript
       //Create a new s3 object
       var s3 = new AWS.S3({region:"eu-west-1"});
       
       //The file service takes the s3 object as the argument constructor
       var fileService = new fss3.FileService(s3);
    ```
    



