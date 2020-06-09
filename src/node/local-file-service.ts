import {AbstractFileService, FpOptional, parsedInputRequest, parsedOutputRequest} from "../file-service";
import {CopyOperation, FileContent, LocalFile, Optional, Scanned, WriteRequest} from "../api";
import {
    copyFileSync,
    createReadStream,
    existsSync,
    readdirSync,
    readFileSync,
    Stats,
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
import {parseLocalFile} from "./parse-local-file";
import {Separated} from "fp-ts/lib/Compactable";
import {PathStats} from "./path-stats";

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

    toPathStats<T extends LocalFile>(file: T): PathStats<T> {
        return {file: file, stats: statSync(file.key)};
    }

    protected toFilesAndFolders<T extends LocalFile>(files: T[]): Separated<PathStats<T>[], PathStats<T>[]> {
        const isFile = (stats: Stats) => stats.isFile();
        const isValid = (stats: Stats) => stats.isDirectory() || isFile(stats);
        const validPathStats = files
            .filter(f => existsSync(f.key))
            .map(f => this.toPathStats(f))
            .filter(pathStats => isValid(pathStats.stats));
        return partition((s: PathStats<T>) => isFile(s.stats))(validPathStats);
    }

    @parsed
    async *list<F extends LocalFile>(@parsedLocalFile fileOrFolder: F): AsyncIterable<Scanned<F>> {
        const pathStats = this.toFilesAndFolders([fileOrFolder]);
        const files = pathStats.right.map(s => s.file);
        const scannedFiles = await Promise.all(files.map(p => this.scan<F>(p)));
        const existingFiles = this.existingOnly(scannedFiles);
        for(const file of existingFiles) {
            yield file;
        }
        for(const dirStats of pathStats.left) {
            const subFiles = this.readDir(dirStats.file);
            for(const f of subFiles) {
                yield* this.list(f);
            }
        }
    }

    protected readDir<F extends LocalFile>(dir: F): F[] {
        return readdirSync(dir.key)
            .map(p => join(dir.key, p))
            .map(key => ({key}) as F);
    }

    @parsed
    async readFile(@parsedLocalFile file: Scanned<LocalFile>): Promise<FileContent> {
        return readFileSync(file.key);
    }
}