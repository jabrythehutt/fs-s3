import {AbstractFileService, FpOptional} from "../file-service";
import {
    CopyOperation,
    CopyOptions,
    DeleteOptions,
    FileContent,
    LocalFile,
    Optional,
    OverwriteOptions,
    Scanned,
    WriteRequest
} from "../api";
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

export class LocalFileService extends AbstractFileService<LocalFile, {}> {

    constructor(private pollPeriod: number = 100) {
        super();
    }

    async copyFile(request: CopyOperation<LocalFile, LocalFile>,
                       options: CopyOptions<LocalFile, LocalFile>): Promise<void> {
        await this.ensureDirectoryExistence(request.destination);
        copyFileSync(request.source.key, request.destination.key);
    }

    async ensureDirectoryExistence(localFile: LocalFile): Promise<void> {
        const fileInfo = parse(localFile.key);
        await mkdirp(fileInfo.dir);
    }

    async deleteFile(file: Scanned<LocalFile>, options: DeleteOptions<LocalFile>): Promise<void> {
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

    async scan(file: LocalFile): Promise<Optional<Scanned<LocalFile>>> {
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

    toLocationString(f: LocalFile): string {
        return f.key;
    }

    protected async sleep(period: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, period));
    }

    async waitForFileToExist(file: LocalFile): Promise<void> {
        while (!existsSync(file.key)) {
            await this.sleep(this.pollPeriod);
        }
    }

    async writeFile(request: WriteRequest<LocalFile>, options: OverwriteOptions): Promise<void> {
        await this.ensureDirectoryExistence(request.destination);
        writeFileSync(request.destination.key, request.body);
    }

    protected existingOnly<T>(items: Optional<T>[]): T[] {
        return items.filter(item => item.exists).map(item => item.value);
    }

    async *list(file: LocalFile): AsyncIterable<Scanned<LocalFile>[]> {
        const fileStats = statSync(file.key);
        if (fileStats.isFile()) {
            const scannedFiles = [await this.scan(file)];
            yield this.existingOnly(scannedFiles);
        } if (fileStats.isDirectory()) {
            const filePaths = readdirSync(file.key)
                .map(p => join(file.key, p)).map(key => ({key}));
            const partitions = partition((p: LocalFile) => statSync(p.key).isFile())(filePaths);
            const scannedFiles = await Promise.all(partitions.left.map(p => this.scan(p)));
            yield this.existingOnly(scannedFiles);
            for(const dir of partitions.right) {
                yield* this.list(dir);
            }
        }
    }

    async readFile(file: Scanned<LocalFile>): Promise<FileContent> {
        return readFileSync(file.key);
    }
}