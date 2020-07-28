export type ConstructorArgs<T> = T extends new (...args: infer U) => any ? U : never
