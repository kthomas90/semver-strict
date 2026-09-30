// Just enough of the Node test runner's types for the tests in this repo, so
// they compile without pulling in @types/node.
declare module "node:test" {
  export function test(name: string, fn: () => void): void
}

declare module "node:assert/strict" {
  interface Assert {
    equal(actual: unknown, expected: unknown): void
    deepEqual(actual: unknown, expected: unknown): void
    throws(fn: () => unknown, expected?: (err: unknown) => boolean): void
  }
  const assert: Assert
  export default assert
}
