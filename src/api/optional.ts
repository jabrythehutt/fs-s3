export interface Optional<T> {
    exists: boolean;
    value: T | undefined;
    map<V>(mapper: (f: T) => V): Optional<V>;
}