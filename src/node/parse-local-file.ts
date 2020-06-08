import {LocalPathParser} from "./local-path-parser";
import {LocalFile} from "../api";

export const parseLocalFile = (f: LocalFile) => LocalPathParser.toLocalFile(f);