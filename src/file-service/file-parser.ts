import {AnyFile, LocalFile} from "../api";
import {PathParser} from "./path-parser";
import {GenericFileService} from "./generic-file-service";
import {ArgMapper} from "./arg-mapper";

export class FileParser {

    private static parsers: Map<any, PathParser<LocalFile>> = new Map();
    private static parseFileMap: Map<any, Map<string, number[]>> = new Map();


    static registerParser<T extends LocalFile>(target: GenericFileService<T>, parser: PathParser<T>) {
        this.parsers.set(target, parser);
    }

    static registerArgToParse<T extends LocalFile>(target: any,
                                                   methodName: string,
                                                   paramIndex: number,
                                                   mapper: ArgMapper<T>): void {
        const m = this.parseFileMap.get(target) || new Map();
        this.parseFileMap.set(target, m);
        const indexes = m.get(methodName) || [];
        m.set(methodName, indexes);
        indexes.push(paramIndex);
    }

    static parseArgs(target: any, methodName: string, paramValues: any[]): any[] {
        const parseInfo = this.parseFileMap.get(target);
        const parser = this.parsers.get(target);
        return paramValues.map((v, index) => {
            if (parser && parseInfo && parseInfo.get(methodName)?.includes(index)) {
                return parser(v);
            }
            return v;
        });

    }
}