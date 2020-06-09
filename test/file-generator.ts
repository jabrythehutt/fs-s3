import {LocalFile, WriteRequest} from "../src/api";
import {join} from "path";

export class FileGenerator {

    generateTestFiles<T extends LocalFile>(numberToGenerate: number, folder: T): WriteRequest<T>[] {
        return Array.from(new Array(numberToGenerate), () => ({
            destination: this.randomSubFile(folder),
            body: this.randomString()
        }));
    }

    randomString(): string {
        return Math.random().toString(36).substring(7);
    }

    randomSubFile<T extends LocalFile>(folder: T): T {
        const pathParts = Array.from(new Array(Math.ceil(Math.random() * 10)),
            () => this.randomString());
        return {
            ...folder,
            key: `${join(folder.key, ...pathParts)}.txt`
        }

    }
}