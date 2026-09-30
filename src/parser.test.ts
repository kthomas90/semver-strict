import { test } from "node:test"
import assert from "node:assert/strict"
import { SemverParseError } from "./errors.js"
import { compare, format, parseManifest, parseVersion, sortVersions, tryParseVersion } from "./parser.js"

function failure(input: string): SemverParseError {
  const result = tryParseVersion(input)
  if (result.ok) throw new Error(`expected "${input}" to fail to parse`)
  return result.error
}

function expectError(input: string, column: number, messagePart: string): void {
  const error = failure(input)
  assert.equal(error.line, 1)
  assert.equal(error.column, column)
  assert.equal(error.message.includes(messagePart), true)
}

test("parses a plain version", () => {
  assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: [], build: [] })
})

test("parses pre-release and build parts", () => {
  assert.deepEqual(parseVersion("1.4.2-beta.1+exp.sha.5114f85"), {
    major: 1,
    minor: 4,
    patch: 2,
    prerelease: ["beta", 1],
    build: ["exp", "sha", "5114f85"],
  })
})

test("numeric pre-release identifiers become numbers", () => {
  assert.deepEqual(parseVersion("1.0.0-0.3.7").prerelease, [0, 3, 7])
})

test("hyphens are allowed inside identifiers", () => {
  assert.deepEqual(parseVersion("1.0.0-alpha-1.x-y").prerelease, ["alpha-1", "x-y"])
})

test("an alphanumeric identifier may start with zero", () => {
  assert.deepEqual(parseVersion("1.0.0-0a").prerelease, ["0a"])
})

test("build identifiers keep their leading zeros", () => {
  assert.deepEqual(parseVersion("1.0.0+001").build, ["001"])
})

test("a version with a build part but no pre-release", () => {
  const version = parseVersion("1.0.0+20130313144700")
  assert.deepEqual(version.prerelease, [])
  assert.deepEqual(version.build, ["20130313144700"])
})

test("zero is a valid numeric field", () => {
  assert.equal(format(parseVersion("0.0.0")), "0.0.0")
})

test("rejects empty input at the first column", () => {
  expectError("", 1, "Expected a numeric major version")
})

test("rejects leading whitespace", () => {
  expectError(" 1.2.3", 1, "Expected a numeric major version")
})

test("rejects a leading v", () => {
  expectError("v1.2.3", 1, "Expected a numeric major version")
})

test("rejects a leading zero in the major version", () => {
  expectError("01.2.3", 1, "The major version must not have a leading zero")
})

test("points at the start of a leading-zero minor version", () => {
  expectError("1.02.3", 3, "The minor version must not have a leading zero")
})

test("points at the start of a leading-zero patch version", () => {
  expectError("1.2.03", 5, "The patch version must not have a leading zero")
})

test("rejects a missing minor version", () => {
  expectError("1", 2, 'Expected "." after the major version')
})

test("rejects a missing patch version", () => {
  expectError("1.2", 4, 'Expected "." after the minor version')
})

test("rejects a non-numeric patch version", () => {
  expectError("1.2.x", 5, "Expected a numeric patch version")
})

test("rejects a four-part version", () => {
  expectError("1.2.3.4", 6, 'Unexpected character "."')
})

test("rejects trailing characters", () => {
  expectError("1.2.3extra", 6, 'Unexpected character "e"')
})

test("rejects an empty pre-release", () => {
  expectError("1.2.3-", 7, "Expected a pre-release identifier")
})

test("rejects an empty pre-release identifier between dots", () => {
  expectError("1.2.3-beta..1", 12, "Expected a pre-release identifier")
})

test("rejects a trailing dot in the pre-release", () => {
  expectError("1.2.3-beta.", 12, "Expected a pre-release identifier")
})

test("points at the start of a leading-zero pre-release identifier", () => {
  expectError("1.2.3-alpha.01", 13, "Numeric pre-release identifiers must not have a leading zero")
})

test("rejects an empty build part", () => {
  expectError("1.2.3+", 7, "Expected a build identifier")
})

test("rejects an invalid character in build metadata", () => {
  expectError("1.2.3+a_b", 8, 'Unexpected character "_"')
})

test("rejects a pre-release after build metadata", () => {
  expectError("1.2.3+build-x.y+z", 16, 'Unexpected character "+"')
})

test("error message shows the input with a caret under the column", () => {
  const error = failure("1.02.3")
  assert.equal(
    error.message,
    "The minor version must not have a leading zero (line 1, column 3)\n  1.02.3\n    ^",
  )
  assert.equal(error.lineText, "1.02.3")
})

test("parseVersion throws SemverParseError", () => {
  assert.throws(
    () => parseVersion("nope"),
    (err) => err instanceof SemverParseError,
  )
})

test("format round-trips valid versions", () => {
  for (const text of ["1.2.3", "1.0.0-alpha.1", "1.0.0+build.5", "2.3.4-rc.1+sha.abc"]) {
    assert.equal(format(parseVersion(text)), text)
  }
})

test("compare follows the precedence chain from the spec", () => {
  const chain = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ].map(parseVersion)
  for (let i = 0; i < chain.length - 1; i++) {
    assert.equal(compare(chain[i], chain[i + 1]), -1)
    assert.equal(compare(chain[i + 1], chain[i]), 1)
  }
})

test("compare compares numeric fields as numbers, not text", () => {
  assert.equal(compare(parseVersion("1.2.3"), parseVersion("1.10.0")), -1)
  assert.equal(compare(parseVersion("2.0.0"), parseVersion("10.0.0")), -1)
})

test("compare ignores build metadata", () => {
  assert.equal(compare(parseVersion("1.0.0+a"), parseVersion("1.0.0+b")), 0)
})

test("sortVersions orders ascending without mutating its input", () => {
  const input = ["1.4.0", "1.2.3-rc.1", "1.2.3", "0.9.0"].map(parseVersion)
  const sorted = sortVersions(input)
  assert.deepEqual(sorted.map(format), ["0.9.0", "1.2.3-rc.1", "1.2.3", "1.4.0"])
  assert.deepEqual(input.map(format), ["1.4.0", "1.2.3-rc.1", "1.2.3", "0.9.0"])
})

test("parseManifest reads pins and skips blanks and comments", () => {
  const entries = parseManifest("# deps\n\nleft-pad@3.2.1\n  # indented comment\nredis@1.0.0-rc.1\n")
  assert.deepEqual(
    entries.map((e) => [e.name, format(e.version), e.line]),
    [
      ["left-pad", "3.2.1", 3],
      ["redis", "1.0.0-rc.1", 5],
    ],
  )
})

test("parseManifest accepts CRLF line endings", () => {
  const entries = parseManifest("a@1.0.0\r\nb@2.0.0\r\n")
  assert.deepEqual(entries.map((e) => format(e.version)), ["1.0.0", "2.0.0"])
})

test("parseManifest of an empty document is empty", () => {
  assert.deepEqual(parseManifest(""), [])
})

test("parseManifest reports the document line and column of a bad version", () => {
  assert.throws(
    () => parseManifest("# core\nleft-pad@3.2.1\n\nredis@1.2.x"),
    (err) => err instanceof SemverParseError && err.line === 4 && err.column === 11 && err.lineText === "redis@1.2.x",
  )
})

test("parseManifest reports a line with no @", () => {
  assert.throws(
    () => parseManifest("a@1.0.0\nfoo"),
    (err) => err instanceof SemverParseError && err.line === 2 && err.column === 4,
  )
})

test("parseManifest reports a missing package name", () => {
  assert.throws(
    () => parseManifest("@1.2.3"),
    (err) => err instanceof SemverParseError && err.line === 1 && err.column === 1,
  )
})
