import {
    CopyOptions,
    CopyRequest,
    DeleteOptions,
    FileContent,
    FpOptional,
    GenericFileService,
    LocalFile,
    Optional,
    Scanned,
    WriteOptions,
    WriteRequest,
    Scanner,
    sleep
} from "@jabrythehutt/fs-s3-core";
import {expect} from "chai";
import {basename} from "path";
import {FileInfo} from "./file-info";
import {getType} from "mime";
import {pipe} from "fp-ts/lib/pipeable";
import {fold, fromNullable} from "fp-ts/lib/Option";
import {fileSorter} from "./file-sorter";

export class FileServiceTester<T extends LocalFile, W = unknown> {

    constructor(readonly fileService: GenericFileService<T, W>, readonly scanner: Scanner) {
    }

    async testWriteRead(request: WriteRequest<T>, options?: WriteOptions & W): Promise<void> {
        await this.fileService.write(request, options);
        await this.testRead(request.destination, FpOptional.of(request.body));
    }

    async testRead(file: T, expectedContent: Optional<FileContent>): Promise<void> {
        const content = await this.fileService.read(file);
        const locationString = this.fileService.toLocationString(file);
        pipe(
            fromNullable(expectedContent.value),
            fold(
                () => expect(content.exists).to.equal(false,
                    `Didn't expect to read a value for ${locationString}`),
                () => expect(content.exists).to.equal(true, `Expected to get a value for ${locationString}`)  &&
                    expect(content.value.toString()).to.equal(expectedContent.value.toString(), "Didn't read the expected value")
            )
        );
    }

    async testReadFile(file: Scanned<T>, expected: FileContent): Promise<void> {
        const content = await this.fileService.readFile(file);
        expect(content.toString()).to.equal(expected);
    }

    async testWriteReadFile(request: WriteRequest<T>, options?: WriteOptions & W): Promise<void> {
        const response = await this.fileService.write(request, options);
        const writtenFile = response.value;
        expect(writtenFile).to.be.an("object", "Failed to write the requested file");
        await this.testReadFile(writtenFile, request.body);
    }

    async toScanned(request: WriteRequest<T>): Promise<Scanned<T>> {
        const contentInfo = await this.scanner.scan(request.body);
        return {
            ...request.destination,
            ...contentInfo,
            mimeType: getType(request.destination.key)
        };
    }

    async testWriteScan(request: WriteRequest<T>, options?: WriteOptions & W): Promise<void> {
        await this.fileService.write(request, options);
        const scannedFile = await this.toScanned(request);
        const expectedScan = FpOptional.of(scannedFile);
        await this.testScan(request.destination, expectedScan);
    }

    async testScan(file: T, expected: Optional<Scanned<T>>): Promise<void> {
        expect((await this.fileService.scan(file)).value).to.deep.equal(expected.value,
            `Didn't get the expected scan result for ${this.fileService.toLocationString(file)}`);
    }

    describeFile(input: Scanned<T>): FileInfo {
        return {
            fileName: basename(input.key),
            md5: input.md5,
            mimeType: input.mimeType,
            size: input.size
        };
    }

    sorter = fileSorter;

    async collectAll(folder: T): Promise<Scanned<T>[]> {
        const collection = [];
        for await (const item of this.fileService.list(folder)) {
            collection.push(item);
        }
        return collection.sort(this.sorter);
    }

    async testCopyList<A extends T, B extends T>(request: CopyRequest<A, B>, options?: CopyOptions<A, B> & W): Promise<void> {
        const sourceFiles = await this.collectAll(request.source);
        await this.fileService.copy(request, options);
        await this.testList(request.destination, sourceFiles.map(f => this.describeFile(f)));
    }

    async testWriteAndWait(request: WriteRequest<T>, options?: WriteOptions & W): Promise<void> {
        const expectedFile = await this.toScanned(request);
        const waitForFilePromise = this.testWait(request.destination, expectedFile);
        await sleep(100);
        await this.fileService.write(request, options);
        await waitForFilePromise;
    }

    async testWait(file: T, expected: Scanned<T>): Promise<void> {
        const response = await this.fileService.waitForFile(file);
        expect(response).to.deep.equal(expected,
            `Didn't get the expected file when waiting for ${this.fileService.toLocationString(file)}`);
    }

    async testList(folder: T, expectedFiles: FileInfo[]): Promise<void> {
        const content = await this.collectAll(folder);
        const describe = f => this.describeFile(f);
        expect(content.map(describe)).to.deep.equal(expectedFiles,
            `Didn't find the expected files in ${this.fileService.toLocationString(folder)}`);
    }

    async testDelete(file: T, options?: DeleteOptions<T>): Promise<void> {
        await this.fileService.delete(file, options);
        const matchingFiles = await this.collectAll(file);
        expect(matchingFiles).to.have.lengthOf(0,
            `Didn't expect to find any files in the deleted folder ${this.fileService.toLocationString(file)}`);
    }

    async testWriteDelete(request: WriteRequest<T>, options?: WriteOptions & W, deleteOptions?: DeleteOptions<T>): Promise<void> {
        await this.fileService.write(request, options);
        await this.testDelete(request.destination, deleteOptions);
    }
}