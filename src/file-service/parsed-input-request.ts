import {InputRequest, LocalFile} from "../api";
import {parsedArg} from "./parsed-arg";

export const parsedInputRequest = <T extends LocalFile, W>(mapper: (t: T) => T): ParameterDecorator => {
    return parsedArg<T, InputRequest<T>>(arg => ({
        ...arg,
        source: mapper(arg.source)
    }));
};