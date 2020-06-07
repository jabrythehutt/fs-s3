[![CircleCI](https://circleci.com/gh/jabrythehutt/fs-s3.svg?style=svg)](https://circleci.com/gh/jabrythehutt/fs-s3)
<a href="https://codeclimate.com/github/jabrythehutt/fs-s3/maintainability"><img src="https://api.codeclimate.com/v1/badges/4b67a943ce875e772b75/maintainability" /></a>
<a href="https://codeclimate.com/github/jabrythehutt/fs-s3/test_coverage"><img src="https://api.codeclimate.com/v1/badges/4b67a943ce875e772b75/test_coverage" /></a>
# Yet another S3 wrapper

I often find myself reinventing the wheel when using the AWS SDK for S3 browser and node-based operations.

Copying and deleting multiple files just requires too much boilerplate code and existing efforts (such as [node-s3-client](https://github.com/andrewrk/node-s3-client)) have either been abandoned, do not support promises or only work for Node.

If you like promises then this could be yet another S3 wrapper for you.

## Usage