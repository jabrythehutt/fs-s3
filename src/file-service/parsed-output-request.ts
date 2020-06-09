import {LocalFile, OutputRequest} from "../api";
import {parsedArg} from "./parsed-arg";

export const parsedOutputRequest = <T extends LocalFile>(mapper: (t: T) => T) =>
    parsedArg<OutputRequest<T>>(arg => ({
        ...arg,
        destination: mapper(arg.destination)
    }));