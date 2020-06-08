import {FileParser} from "./file-parser";
import {LocalFile} from "../api";
import {ArgMapper} from "./arg-mapper";

export function parsedFile<T extends LocalFile>(mapper: ArgMapper<T> = (arg) => [arg]) {
    // tslint:disable-next-line:only-arrow-functions
    return function(target: any, propertyKey: string, parameterIndex: number) {
        FileParser.registerArgToParse(target, propertyKey, parameterIndex, mapper);
    }

}