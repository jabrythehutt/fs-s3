import {FileParser} from "./file-parser";

export function parsePath(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
        return originalMethod.apply(this, FileParser.parseArgs(target, propertyKey, args));
    }
}