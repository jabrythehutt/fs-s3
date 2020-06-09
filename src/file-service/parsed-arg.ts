import {FileParser} from "./file-parser";
import {GenericFileService} from "./generic-file-service";
import {LocalFile} from "../api";

export function parsedArg<T extends LocalFile, A>(parser: (input: A) => A = a => a): ParameterDecorator {
    return function<T extends LocalFile, W>(target: GenericFileService<T, W>,
                                            propertyKey: string,
                                            parameterIndex: number): void {
        FileParser.registerArgToParse<T, A>(target, propertyKey, parameterIndex, parser);
    }

}