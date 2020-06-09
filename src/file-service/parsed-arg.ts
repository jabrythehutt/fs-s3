import {FileParser} from "./file-parser";

export function parsedArg<T>(parser: (input: T) => T = a => a) {
    // tslint:disable-next-line:only-arrow-functions
    return function(target: any, propertyKey: string, parameterIndex: number) {
        FileParser.registerArgToParse(target, propertyKey, parameterIndex, parser);
    }

}