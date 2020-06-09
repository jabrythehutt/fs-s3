import {LocalFile, OutputRequest} from "../api";
import {parsedArg} from "./parsed-arg";

export const parsedOutputRequest = <T extends LocalFile>(mapper: (t: T) => T): ParameterDecorator =>
    parsedArg<T, OutputRequest<T>>(arg => ({
        ...arg,
        destination: mapper(arg.destination)
    }));