// Typed wrappers around Jest's asymmetric matchers.
//
// @types/jest declares `expect.objectContaining<E>(obj: E): any` and
// `expect.any(constructor): any` — both intentionally return `any` (the
// matcher object doesn't structurally match `E`/the class instance, so the
// library can't type it as such). Using either nested inside another
// object/array literal (e.g. `data: expect.objectContaining({...})`) makes
// that literal's *inferred* type carry an `any` property, which trips
// @typescript-eslint/no-unsafe-assignment even though nothing unsafe is
// actually happening — the runtime value is the exact same asymmetric
// matcher jest would have produced anyway.
//
// These re-export that same runtime matcher, narrowed back to a concrete
// type at the call site — no behavior change, purely a compile-time/lint
// fix. Used across this project's *.service.spec.ts files wherever a
// matcher is nested inside another literal.

/** `expect.objectContaining(shape)`, typed as `T` instead of `any`. */
export function matching<T extends object>(shape: T): T {
  return expect.objectContaining(shape) as T;
}

/** `expect.any(ctor)`, typed as `T` instead of `any`. */
export function anyInstanceOf<T>(ctor: new (...args: any[]) => T): T {
  return expect.any(ctor) as T;
}

/** `expect.anything()`, typed as `T` instead of `any`. */
export function matchAnything<T = unknown>(): T {
  return expect.anything() as T;
}

/** `expect.stringContaining(substring)`, typed as `string` instead of `any`. */
export function stringContaining(substring: string): string {
  return expect.stringContaining(substring) as string;
}

/** `expect.stringMatching(pattern)`, typed as `string` instead of `any`. */
export function stringMatchingRe(pattern: string | RegExp): string {
  return expect.stringMatching(pattern) as string;
}
