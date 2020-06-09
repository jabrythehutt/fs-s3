export class FileParser {

    private static parseFileMap: Map<any, Map<string, Map<number, ((t) => any)[]>>> = new Map();

    static registerArgToParse<T>(target: any, methodName: string, paramIndex: number, mapper: (t: T) => T): void {
        const m = this.parseFileMap.get(target) || new Map();
        this.parseFileMap.set(target, m);
        const indexes = m.get(methodName) || new Map();
        m.set(methodName, indexes);
        const mappers = indexes.get(paramIndex) || [];
        indexes.set(paramIndex, mappers);
        mappers.push(mapper);
    }

    static identity = <T>(t: T) => t;

    static getArgMappers<T>(target: any, methodName: string, argIndex: number): ((t: T) => T)[] {
        return (this.parseFileMap.get(target)?.get(methodName)?.get(argIndex)) || [this.identity];
    }

    static parseArgs(target: any, methodName: string, paramValues: any[]): any[] {
        return paramValues.map((v, index) => {
            const mappers = this.getArgMappers(target, methodName, index);
            return mappers.reduce((arg, mapper) => mapper(arg), v);
        });

    }
}