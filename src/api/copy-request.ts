import {LocalFile} from "./local-file";
import {InputRequest} from "./input-request";
import {OutputRequest} from "./output-request";

export type CopyRequest<S extends LocalFile, D extends LocalFile> = InputRequest<S> & OutputRequest<D>