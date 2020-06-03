/**
 * Transform an interface to mark all fields as required e.g.
 *
 * interface Foo {
 *     bar?: number
 * }
 *
 * type Baz = Complete<Foo>
 *
 *  Baz is equivalent to:
 *
 *  interface Baz {
 *      bar: number;
 *  }
 *
 */
export type Complete<T> = {
    [P in keyof Required<T>]: Pick<T, P> extends Required<Pick<T, P>> ? T[P] : (T[P] | undefined);
};