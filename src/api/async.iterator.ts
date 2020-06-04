export interface AsyncIterator<T> {
    hasNext(): boolean;
    next(): Promise<T>;
}