#Yet another AWS S3 wrapper

I often find myself reinventing the wheel when using the AWS SDK for S3 operations in the browser and in Node.

Copying and deleting multiple files just requires too much boilerplate code and existing efforts (such as [node-s3-client](https://github.com/andrewrk/node-s3-client)) have either been abandoned, do not support promises or only work for Node.

If you like promises (not the Donald Trump variety, but the ES6y ones that tend to get resolved) then this could be yet another AWS S3 wrapper for you.

## Usage

```npm install --save @djabry/fs-s3```

1. Import the script

    * Node or browser with modern packaging system

        ES6 or TypeScript: ```import * as fss3 from '@djabry/fs-s3';```

        or

        Standard: ```var fss3 = require("fs-s3");```

    * Simple browser

         ```<script src="node_modules/@djabry/fs-s3/dist/fs-s3-standalone.min.js"></script>```





