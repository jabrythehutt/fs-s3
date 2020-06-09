import {AbstractFileService, FpOptional} from "../file-service";
import {CopyOperation, FileContent, LocalFile, Optional, Scanned, WriteRequest} from "../api";
import {
    copyFileSync,
    createReadStream,
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    unlinkSync,
    writeFileSync
} from "fs";
import {getType} from "mime";
import {Readable} from "stream";
import {createHash} from "crypto";
import {join, parse} from "path";
import {partition} from "fp-ts/lib/Array";
import mkdirp from "mkdirp";
import {parsed} from "../file-service/parsed";
import {parsedLocalFile} from "./parsed-local-file";
import {parsedInputRequest} from "../file-service/parsed-input-request";
import {parseLocalFile} from "./parse-local-file";
import {parsedOutputRequest} from "../file-service/parsed-output-request";

export class LocalFileService extends AbstractFileService<LocalFile> {

    constructor(private pollPeriod: number = 100) {
        super();
    }

    @parsed
    async copyFile(@parsedInputRequest(parseLocalFile)
                   @parsedOutputRequest(parseLocalFile) request: CopyOperation<LocalFile, LocalFile>): Promise<void> {
        await this.ensureDirectoryExistence(request.destination);
        copyFileSync(request.source.key, request.destination.key);
    }

    @parsed
    async ensureDirectoryExistence(@parsedLocalFile localFile: LocalFile): Promise<void> {
        const fileInfo = parse(localFile.key);
        await mkdirp(fileInfo.dir);
    }

    @parsed
    async deleteFile(@parsedLocalFile file: Scanned<LocalFile>): Promise<void> {
        unlinkSync(file.key);
    }

    protected async calculateStreamMD5(stream: Readable): Promise<string> {
        const hash = createHash("md5");
        for await (const chunk of stream) {
            hash.update(chunk, "utf8");
        }
        return hash.digest("hex");
    }

    private calculateLocalMD5(file: LocalFile): Promise<string> {
        return this.calculateStreamMD5(createReadStream(file.key));
    }

    @parsed
    async scan<F extends LocalFile>(@parsedLocalFile file: F): Promise<Optional<Scanned<F>>> {
        if (existsSync(file.key)) {
            const fileInfo = statSync(file.key);
            if (fileInfo.isFile()) {
                return FpOptional.of({
                    ...file,
                    md5: await this.calculateLocalMD5(file),
                    size: statSync(file.key).size,
                    mimeType: getType(file.key)
                });
            }
        }
        return FpOptional.empty();
    }

    @parsed
    toLocationString(@parsedLocalFile f: LocalFile): string {
        return f.key;
    }

    protected async sleep(period: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, period));
    }

    @parsed
    async waitForFileToExist(@parsedLocalFile file: LocalFile): Promise<void> {
        while (!existsSync(file.key)) {
            await this.sleep(this.pollPeriod);
        }
    }

    @parsed
    async writeFile(@parsedOutputRequest(parseLocalFile) request: WriteRequest<LocalFile>): Promise<void> {
        await this.ensureDirectoryExistence(request.destination);
        writeFileSync(request.destination.key, request.body);
    }

    protected existingOnly<T>(items: Optional<T>[]): T[] {
        return items.filter(item => item.exists).map(item => item.value);
    }

    @parsed
    async *list<F extends LocalFile>(@parsedLocalFile file: F): AsyncIterable<Scanned<F>> {
        if (existsSync(file.key)) {
            const fileStats = statSync(file.key);
            if (fileStats.isFile()) {
                const scanned = await this.scan(file);
                if (scanned.exists) {
                    yield scanned.value;
                }
            } if (fileStats.isDirectory()) {
                const filePaths = readdirSync(file.key)
                    .map(p => join(file.key, p)).map(key => ({key} as F));
                const partitions = partition((p: F) => statSync(p.key).isFile())(filePaths);
                const scannedFiles = await Promise.all(partitions.right.map(p => this.scan<F>(p)));
                for (const v of this.existingOnly<Scanned<F>>(scannedFiles)) {
                    yield v;
                }
                for (const dir of partitions.left) {
                    yield* this.list<F>(dir);
                }
            }
        }
    }

    @parsed
    async readFile(@parsedLocalFile file: Scanned<LocalFile>): Promise<FileContent> {
        return readFileSync(file.key);
    }
}