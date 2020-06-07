export interface Optional<T> {
    exists: boolean;
    value: T | undefined;
}