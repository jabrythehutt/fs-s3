import {CopyOperation, CopyOptions, DeleteOptions, LocalFile, WriteOptions, WriteRequest} from "../src/api";
import {FileServiceTester} from "./file-service-tester";
import {FileGenerator} from "./file-generator";
import {FpOptional} from "../src/file-service";
import {Scanned} from "../lib/api";
import {expect} from "chai";
import {join} from "path";
import {Suite} from "mocha";

export const generateTests = <F extends LocalFile, W>(name: string,
                                                      folderFactory: () => F,
                                                      testerFactory: () => FileServiceTester<F, W>): Suite => {
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
                [writeRequest] = fileGenerator.generateTestFiles(1, folder);
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

            it("Overwrites an existing file when overwriting is enabled", async () => {
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

            it("Listens to delete operations", async () => {
                const deletedFile = [];
                await tester.testWriteDelete(writeRequest, undefined, {
                    listener: o => deletedFile.push(o)
                } as DeleteOptions<F>);
                expect(deletedFile).to.deep.equal([tester.toScanned(writeRequest)])
            });

            it("Listens to copy operations", async () => {
                const copyOperations = [];
                const [destinationRequest] = fileGenerator.generateTestFiles(1, folder);
                await tester.fileService.write(writeRequest);
                const options = {
                    listener: o => copyOperations.push(o)
                } as CopyOptions<F, F>;
                await tester.fileService.copy({
                    source:writeRequest.destination,
                    destination: destinationRequest.destination
                }, options as CopyOptions<F, F> & W);
                const expectedCopyOperation: CopyOperation<F, F> = {
                    source: tester.toScanned(writeRequest),
                    destination: destinationRequest.destination
                };
                expect(copyOperations).to.deep.equal([expectedCopyOperation]);
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

            it("Copies all the files to another folder", async () => {
                await tester.testCopyList({
                    source: folder,
                    destination: {
                        ...folder,
                        key: join(folder.key, "foo")
                    }
                });
            });

        });

        describe("Copy overwrite behaviour", () => {
            let source: F;
            let destination:  F;
            let options: CopyOptions<F, F>;
            let copyOperations: CopyOperation<F, F>[];

            beforeEach(async () => {
                const [sourceWriteRequest, destinationWriteRequest] = fileGenerator.generateTestFiles(2, folder);
                await tester.fileService.write(sourceWriteRequest);
                source = sourceWriteRequest.destination;
                destination = destinationWriteRequest.destination;
                await tester.fileService.copy({source, destination});
                copyOperations = [];
                options = {
                    listener: o => copyOperations.push(o)
                } as CopyOptions<F, F>;
            });

            it("Doesn't overwrite a file when the source and destination are the same", async () => {
                options.overwrite = true;
                await tester.fileService.copy({source, destination: source}, options as CopyOptions<F, F> & W);
                expect(copyOperations).to.have.lengthOf(0);
            });

            it("Overwrites an existing file when copying a file using the overwrite option", async () => {
                options.overwrite = true;
                await tester.fileService.copy({source, destination}, options as CopyOptions<F, F> & W);
                expect(copyOperations).to.have.lengthOf(1);
            });

            it("Doesn't overwrite an existing file when copying a file not set to overwrite", async () => {
                options.overwrite = false;
                await tester.fileService.copy({source, destination}, options as CopyOptions<F, F> & W);
                expect(copyOperations).to.have.lengthOf(0);
            });

            it("Doesn't overwrite identical content when content-based skipping is enabled", async () => {
                options.overwrite = true;
                options.skipSame = true;
                await tester.fileService.copy({source, destination}, options as CopyOptions<F, F> & W);
                expect(copyOperations).to.have.lengthOf(0);
            });

            it("Overwrites different content when content-based skipping is enabled", async () => {
                options.overwrite = true;
                options.skipSame = true;
                const [otherWriteRequest] = fileGenerator.generateTestFiles(1, folder);
                await tester.fileService.write(otherWriteRequest);
                await tester.fileService.copy({source: otherWriteRequest.destination, destination},
                    options as CopyOptions<F, F> & W);
                expect(copyOperations).to.have.lengthOf(1);
            });
        });
    });
};
