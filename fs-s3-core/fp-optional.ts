import {fold, fromNullable, isSome, Option, toUndefined} from "fp-ts/lib/Option";
import {Optional} from "./index";
import {pipe} from "fp-ts/lib/pipeable";

export class FpOptional<T> implements Optional<T> {

    readonly subject: Option<T>;

    protected constructor(value?: T) {
        this.subject = fromNullable(value);
    }

    static of<V>(value: V): FpOptional<V> {
        return new FpOptional<V>(value);
    }

    static empty<V>(): FpOptional<V> {
        return new FpOptional<V>();
    }

    get exists(): boolean {
        return isSome(this.subject);
    }

    get value(): T | undefined {
        return toUndefined(this.subject);
    }

    map<V>(mapper: (f: T) => V, emptyMapper: () => V = () => undefined): Optional<V> {
        return FpOptional.of(pipe(
            this.subject,
            fold(
                emptyMapper,
                mapper
            )
        ));
    }
}