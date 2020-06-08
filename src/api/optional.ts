export interface Optional<T> {
    exists: boolean;
    value: T | undefined;
    map<V>(mapper: (f: T) => V, emptyMapper?: () => V): Optional<V>;
}