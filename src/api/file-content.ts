import {Readable} from "stream";
interface Blob {}

export type FileContent = Buffer|Uint8Array|Blob|string|Readable;