# FS-S3
This project provides an abstraction layer that covers some common read and write operations relating to the Node file system and AWS S3. 

It's currently a work in progress, you can use the [old version](https://github.com/jabrythehutt/fs-s3/tree/v0.3.14) until this is published.

## Why
I found myself re-implementing the following procedures in various projects:
* Copy a local folder to S3
* Skip existing files
* Delete files in an S3 folder

This project aims to make it easier and safer to write your S3-based storage layer.

## Usage

### Web
```typescript
import {S3FileService} from "@jabrythehutt/fs-s3";
import S3 from "aws-sdk/clients/s3";

const s3 = new S3();
const fileService = new S3FileService(s3);

async function deleteOldFiles() {
    await fileService.delete({
        key: "my/old-files",
        bucket: "my-bucket"
    });
}

```

### Node
```typescript

import {NodeFileService, LocalFileService} from "@jabrythehutt/fs-s3/lib/node";
import {S3FileService} from "@jabrythehutt/fs-s3";
import S3 from "aws-sdk/clients/s3";

const s3 = new S3();
const fileService = new NodeFileService(new LocalFileService(), new S3FileService(s3));

async function localToS3() {
    const source = {
        key: "/tmp/myfolder"
    };
    const destination = {
        bucket: "my-bucket",
        key: "foo/mynewfolder"
    }
    await fileService.copy({source, destination});
}


```



