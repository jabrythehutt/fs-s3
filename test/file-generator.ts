import {LocalFile, WriteRequest} from "../src/api";
import {join} from "path";

export class FileGenerator {

    generateTestFiles<T extends LocalFile>(numberToGenerate: number, folder: T): WriteRequest<T>[] {
        return Array.from(new Array(numberToGenerate), () => ({
            destination: this.randomSubFile(folder),
            body: this.randomString()
        }));
    }

    /**
     * Adapted from https://lowrey.me/permutation-with-an-es6-javascript-generator-2/
     * @param elements
     */
    *permutations<T>(elements: T[]): Iterable<T[]> {
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

    randomSubFile<T extends LocalFile>(folder: T): T {
        const pathParts = Array.from(new Array(Math.ceil(Math.random() * 10)),
            () => this.randomString());
        return {
            ...folder,
            key: `${join(folder.key, ...pathParts)}.txt`
        }

    }
}