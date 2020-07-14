import {
    CopyOperation,
    CopyOptions,
    DeleteOptions,
    FileContent,
    FpOptional,
    LocalFile,
    Optional,
    OverwriteOptions,
    Scanned,
    WriteRequest,
    Scanner,
    sleep
} from "@jabrythehutt/fs-s3-core";
import {getType} from "mime";
import {AbstractFileService} from "./abstract-file-service";

export abstract class MemoryFileService<T extends LocalFile, W = unknown> extends AbstractFileService<T, W> {

    protected store: Record<string, string> = {};

    constructor(private scanner: Scanner, private pollPeriod: number = 100) {
        super();
    }

    async copyFile<A extends T = T, B extends T = T>(request: CopyOperation<A, B>, options: CopyOptions<A, B> & W):
        Promise<void> {
            const sourceKey = this.toLocationString(request.source);
            const destinationKey = this.toLocationString(request.destination);
            this.store[destinationKey] = this.store[sourceKey];
    }

    async scan<F extends T = T>(f: F): Promise<Optional<Scanned<F>>> {
        const locationString = this.toLocationString(f);
        const existingValue = this.store[locationString];
        if(typeof existingValue === "string") {
            const mimeType = getType(f.key);
            const contentInfo = await this.scanner.scan(existingValue);
            return FpOptional.of({
                mimeType,
                ...f,
                ...contentInfo
            });
        }
        return FpOptional.empty();

    }

    async readFile(file: Scanned<T>): Promise<FileContent> {
        return this.store[this.toLocationString(file)];
    }

    async waitForFileToExist(f: T): Promise<void> {
        const locationString = this.toLocationString(f);
        while(!this.store[locationString]) {
            await sleep(this.pollPeriod);
        }
    }

    async deleteFile(file: Scanned<T>, options: DeleteOptions<T>): Promise<void> {
        const locationString = this.toLocationString(file);
        delete this.store[locationString];
    }

    async writeFile(request: WriteRequest<T>, options: OverwriteOptions & W): Promise<void> {
        const locationString = this.toLocationString(request.destination);
        this.store[locationString] = request.body.toString();
    }

    async* list<F extends T = T>(fileOrFolder: F): AsyncIterable<Scanned<F>> {
        const locationString = this.toLocationString(fileOrFolder);
        const keys = Object.keys(this.store).filter(k => k.startsWith(locationString));
        for(const key of keys) {
            const body = this.store[key];
            const contentInfo = await this.scanner.scan(body);
            const file = {
                ...fileOrFolder,
                key: key.replace(locationString, fileOrFolder.key)
            }
            const mimeType = getType(file.key);
            const scannedFile = {
                mimeType,
                ...file,
                ...contentInfo,
            };
            yield scannedFile;
        }
        
    }

}