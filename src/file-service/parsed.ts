import {FileParser} from "./file-parser";
import {GenericFileService} from "./generic-file-service";
import {LocalFile} from "../api";

export const parsed: MethodDecorator = <T extends LocalFile, W>(target: GenericFileService<T, W>,
                                        propertyKey: string, descriptor: PropertyDescriptor): void => {
    const originalMethod = descriptor.value;
    descriptor.value = function<A> (...args: A[]) {
        return originalMethod.apply(this, FileParser.parseArgs(target, propertyKey, args));
    }
};