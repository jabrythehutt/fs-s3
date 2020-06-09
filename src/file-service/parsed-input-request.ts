import {InputRequest, LocalFile} from "../api";
import {parsedArg} from "./parsed-arg";

export const parsedInputRequest = <T extends LocalFile>(mapper: (t: T) => T) =>
    parsedArg<InputRequest<T>>(arg => ({
        ...arg,
        source: mapper(arg.source)
    }));