import {LocalFile, WriteRequest} from "../src/api";
import {join} from "path";
import {GenericFileService} from "../src/file-service";

export class FileGenerator<T extends LocalFile> {

    constructor(private fileService: GenericFileService<T>) {
    }

    generateTestFiles<F extends T>(numberToGenerate: number, folder: F): WriteRequest<F>[] {
        return Array.from(new Array(numberToGenerate), () => ({
            destination: this.randomSubFile<F>(folder),
            body: this.randomString()
        }));
    }

    /**
     * Adapted from https://lowrey.me/permutation-with-an-es6-javascript-generator-2/
     * @param elements
     */
    *permutations<F extends T>(elements: F[]): Iterable<F[]> {
        if (elements.length === 1) {
            yield elements;
        } else {
            const [first, ...rest] = elements;
            for (const perm of this.permutations(rest)) {
                for (let i = 0; i < elements.length; i++) {
                    const start = perm.slice(0, i);
                    const rest = perm.slice(i);
                    yield [...start, first, ...rest];
                }
            }
        }
    }

    randomString(): string {
        return Math.random().toString(36).substring(7);
    }

    randomSubFile<F extends T>(folder: F): F {
        const pathParts = Array.from(new Array(Math.ceil(Math.random() * 10)),
            () => this.randomString());
        return this.fileService.parse({
            ...folder,
            key: `${join(folder.key, ...pathParts)}.txt`
        })

    }
}