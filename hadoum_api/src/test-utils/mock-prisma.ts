// Shared helper for this project's `createMockPrisma()` unit-test fixtures
// (one per *.service.spec.ts, each hand-rolling a subset of PrismaService's
// delegates as `{ create: jest.fn(), findUnique: jest.fn(), ... }` objects).
//
// Every one of those factories also needs a self-referencing `$transaction`
// mock — `jest.fn((cb) => cb(prisma))`, so a service calling
// `this.prisma.$transaction(tx => tx.foo.create(...))` in a unit test
// still runs `tx.foo.create` against the SAME mocked delegates. Because
// `prisma` refers to itself inside its own initializer, TypeScript can't
// structurally infer its type there and silently falls back to `any` for
// the whole object — which is what made every downstream
// `prisma.foo.bar(...)` access "unsafe" under
// @typescript-eslint/no-unsafe-*. Doing the self-reference once, here,
// behind an explicit generic return type, keeps every call site's mock
// delegates fully typed.

/** A namespaced mock (e.g. `{ create: jest.fn(), findUnique: jest.fn() }`). */
export type MockDelegate = Record<string, jest.Mock>;

/**
 * Wraps a set of already-typed mock delegates (`{ stockItem: {...}, notification: {...} }`)
 * with a self-referencing `$transaction` mock, exactly like the real
 * `PrismaService.$transaction(cb)` — `cb` is invoked with the same mock
 * object, so nested delegate calls inside a transaction still land on it.
 */
export function withMockTransaction<T extends Record<string, MockDelegate>>(
  delegates: T,
): T & { $transaction: jest.Mock } {
  const prisma: T & { $transaction: jest.Mock } = {
    ...delegates,
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  return prisma;
}
