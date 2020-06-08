import {LocalFile} from "../api";
import {PathParser} from "./path-parser";
import {GenericFileService} from "./generic-file-service";
import {FileParser} from "./file-parser";

export function RegisterParser<T extends LocalFile>(parser: PathParser<T>) {
    // tslint:disable-next-line:only-arrow-functions
    return function (constructor: new (...args) => GenericFileService<T, any>) {
        FileParser.registerParser(constructor.prototype, parser);
    }
}