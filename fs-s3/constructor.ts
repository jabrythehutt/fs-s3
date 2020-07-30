import {ConstructorArgs} from "./constructor-args";

export type Constructor<A> = new(...args: ConstructorArgs<A>) => A;