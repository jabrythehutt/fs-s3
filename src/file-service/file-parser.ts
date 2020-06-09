import {GenericFileService} from "../../lib/file-service";
import {LocalFile} from "../api";

export class FileParser {

    private static parseFileMap: Map<GenericFileService<LocalFile>,
        Map<string, Map<number, (<T>(t: T) => T)[]>>> = new Map();

    static registerArgToParse<T extends LocalFile, A>(target: GenericFileService<T>, methodName: string,
                              paramIndex: number, mapper: (t: A) => A): void {
        const m = this.parseFileMap.get(target) || new Map();
        this.parseFileMap.set(target, m);
        const indexes = m.get(methodName) || new Map();
        m.set(methodName, indexes);
        const mappers = indexes.get(paramIndex) || [];
        indexes.set(paramIndex, mappers);
        mappers.push(mapper);
    }

    static identity = <T>(t: T): T => t;

    static getArgMappers<T extends LocalFile, W>(target: GenericFileService<T, W>,
                                                 methodName: string,
                                                 argIndex: number): (<A>(t: A) => A)[] {
        return (this.parseFileMap.get(target)?.get(methodName)?.get(argIndex)) || [this.identity];
    }

    static parseArgs<T extends LocalFile, W, A>(target: GenericFileService<T, W>, methodName: string, paramValues: A[]): A[] {
        return paramValues.map((v, index) => {
            const mappers = this.getArgMappers<T, W>(target, methodName, index);
            return mappers.reduce((arg, mapper) => mapper(arg), v);
        });

    }
}