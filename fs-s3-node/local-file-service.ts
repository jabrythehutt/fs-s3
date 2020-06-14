import {AbstractFileService} from "@jabrythehutt/fs-s3";
import {
    CopyOperation,
    FileContent,
    FpOptional,
    LocalFile,
    Optional,
    Scanned,
    WriteRequest
} from "@jabrythehutt/fs-s3-core";
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
import {join, normalize, parse, sep} from "path";
import {partition} from "fp-ts/lib/Array";
import mkdirp from "mkdirp";
import {Separated} from "fp-ts/lib/Compactable";
import {PathStats} from "./path-stats";

export class LocalFileService extends AbstractFileService<LocalFile> {

    constructor(private pollPeriod: number = 100) {
        super();
    }

    async copyFile(r: CopyOperation<LocalFile, LocalFile>): Promise<void> {
        const request = this.parseIORequest(r);
        await this.ensureDirectoryExistence(request.destination);
        copyFileSync(request.source.key, request.destination.key);
    }

    async ensureDirectoryExistence(localFile: LocalFile): Promise<void> {
        const fileInfo = parse(this.parse(localFile).key);
        await mkdirp(fileInfo.dir);
    }

    async deleteFile(file: Scanned<LocalFile>): Promise<void> {
        unlinkSync(this.parse(file).key);
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

    async scan<F extends LocalFile>(inputFile: F): Promise<Optional<Scanned<F>>> {
        const file = this.parse(inputFile);
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
        return this.parse(f).key;
    }

    protected async sleep(period: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, period));
    }

    async waitForFileToExist(inputFile: LocalFile): Promise<void> {
        const file = this.parse(inputFile);
        while (!existsSync(file.key)) {
            await this.sleep(this.pollPeriod);
        }
    }

    async writeFile(r: WriteRequest<LocalFile>): Promise<void> {
        const request = this.parseOutputRequest(r);
        await this.ensureDirectoryExistence(request.destination);
        writeFileSync(request.destination.key, request.body);
    }

    protected existingOnly<T>(items: Optional<T>[]): T[] {
        return items.filter(item => item.exists).map(item => item.value);
    }

    protected toPathStats<T extends LocalFile>(file: T): PathStats<T> {
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

    async *list<F extends LocalFile>(inputFileOrFolder: F): AsyncIterable<Scanned<F>> {
        const fileOrFolder = this.parse(inputFileOrFolder);
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

    async readFile(file: Scanned<LocalFile>): Promise<FileContent> {
        return readFileSync(this.parse(file).key);
    }

    protected toLocalPath(key: string): string {
        return normalize(key.split("/").join(sep));
    }

    parse<F extends LocalFile>(fileOrFolder: F): F {
        return {
            ...fileOrFolder,
            key: this.toLocalPath(fileOrFolder.key)
        };
    }
}