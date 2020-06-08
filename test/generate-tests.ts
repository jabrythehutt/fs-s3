import {LocalFile, WriteOptions, WriteRequest} from "../src/api";
import {FileServiceTester} from "./file-service-tester";
import {FileGenerator} from "./file-generator";
import {FpOptional} from "../src/file-service";
import {Scanned} from "../lib/api";
import {expect} from "chai";

export function generateTests<F extends LocalFile, W>(name: string,
                                                      folderFactory: () => F,
                                                      testerFactory: () => FileServiceTester<F, W>) {
    const fileGenerator = new FileGenerator();
    return describe(name, () => {
        let tester: FileServiceTester<F, W>;
        let folder: F;
        beforeEach(() => {
            tester = testerFactory();
            folder = folderFactory();
        })

        describe("Single file operations", () => {
            let writeRequest: WriteRequest<F>;
            beforeEach(() => {
                writeRequest = fileGenerator.generateTestFiles(1, folder).shift();
            });
            it("Reads an existing file", async () => {
                await tester.testWriteRead(writeRequest);
            });

            it("Reads a single existing file", async () => {
                await tester.testWriteReadFile(writeRequest);
            });

            it("Returns an empty optional when attempting to read a file that doesn't exist", async () => {
                await tester.testRead(writeRequest.destination, FpOptional.empty());
            });

            it("Overwrites an existing file when the overwriting is enabled", async () => {
                await tester.fileService.write(writeRequest);
                await tester.testWriteReadFile({
                    ...writeRequest,
                    body: "foo"
                }, {overwrite: true} as WriteOptions & W);
            });

            it("Doesn't overwrite an existing file when the overwriting is disabled", async () => {
                await tester.fileService.write(writeRequest);
                const newContent = "foo"
                await tester.fileService.write({
                    ...writeRequest,
                    body: newContent
                }, {overwrite: false} as WriteOptions & W);
                await tester.testRead(writeRequest.destination, FpOptional.of(writeRequest.body));
            });

            it("Scans an existing file", async () => {
                await tester.testWriteScan(writeRequest);
            });

            it("Returns an empty optional when attempting to scan a non-existent file", async () => {
                await tester.testScan(writeRequest.destination, FpOptional.empty());
            });

            it("Waits for an existing file", async () => {
                await tester.testWriteAndWait(writeRequest);
            });

            it("Deletes an existing file", async () => {
                await tester.testWriteDelete(writeRequest);
            });

            it("Skips deleting files that don't exist", async () => {
                await tester.testDelete(writeRequest.destination);
            });
        });

        describe("Operations on multiple files", () => {
            let writeRequests: WriteRequest<F>[];
            async function writeAll(): Promise<Scanned<F>[]> {
                const writtenFiles = await Promise.all(writeRequests.map(r => tester.fileService.write(r)));
                return writtenFiles.filter(f => f.exists).map(f => f.value).sort(tester.sorter);
            }
            beforeEach(() => {
                writeRequests = fileGenerator.generateTestFiles(10, folder);
            });

            it("Produces an empty list when there are no files", async () => {
                await tester.testList(folder, []);
            });

            it("Lists all the files", async () => {
                const allFiles = await writeAll();
                const collectedFiles = await tester.collectAll(folder);
                expect(collectedFiles).to.deep.equal(allFiles);
            });


        });
    });
}
