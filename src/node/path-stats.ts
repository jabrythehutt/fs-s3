import {Stats} from "fs";

export interface PathStats<T> {
    file: T;
    stats: Stats;
}