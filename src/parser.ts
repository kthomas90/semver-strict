import { ScanError, SemverParseError } from "./errors.js"

export interface SemVer {
  major: number
  minor: number
  patch: number
  prerelease: (string | number)[]
  build: string[]
}

export type ParseResult =
  | { ok: true; value: SemVer }
  | { ok: false; error: SemverParseError }

export interface ManifestEntry {
  name: string
  version: SemVer
  line: number
}

function isDigit(ch: string | undefined): ch is string {
  return ch !== undefined && ch >= "0" && ch <= "9"
}

function isAlpha(ch: string | undefined): ch is string {
  return ch !== undefined && ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z"))
}

function isIdentifierChar(ch: string | undefined): ch is string {
  return isDigit(ch) || isAlpha(ch) || ch === "-"
}

function isAllDigits(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!isDigit(text[i])) return false
  }
  return true
}

/** A cursor over a single, single-line string. Positions are 0-based. */
class Scanner {
  pos = 0

  constructor(readonly input: string) {}

  peek(): string | undefined {
    return this.input[this.pos]
  }

  advance(): void {
    this.pos++
  }

  atEnd(): boolean {
    return this.pos >= this.input.length
  }

  expect(char: string, message: string): void {
    if (this.peek() !== char) this.fail(message)
    this.advance()
  }

  fail(message: string): never {
    throw new ScanError(message, this.pos)
  }

  failAt(pos: number, message: string): never {
    throw new ScanError(message, pos)
  }
}

function readNumericField(s: Scanner, field: string): number {
  const start = s.pos
  if (!isDigit(s.peek())) {
    s.fail(`Expected a numeric ${field} version`)
  }
  while (isDigit(s.peek())) s.advance()
  const text = s.input.slice(start, s.pos)
  if (text.length > 1 && text[0] === "0") {
    s.failAt(start, `The ${field} version must not have a leading zero`)
  }
  return Number(text)
}

function readPrerelease(s: Scanner): (string | number)[] {
  const identifiers: (string | number)[] = []
  while (true) {
    const start = s.pos
    while (isIdentifierChar(s.peek())) s.advance()
    const text = s.input.slice(start, s.pos)
    if (text === "") {
      s.fail('Expected a pre-release identifier after "-" or "."')
    }
    if (isAllDigits(text)) {
      if (text.length > 1 && text[0] === "0") {
        s.failAt(start, "Numeric pre-release identifiers must not have a leading zero")
      }
      identifiers.push(Number(text))
    } else {
      identifiers.push(text)
    }
    if (s.peek() === ".") {
      s.advance()
      continue
    }
    break
  }
  return identifiers
}

function readBuild(s: Scanner): string[] {
  const identifiers: string[] = []
  while (true) {
    const start = s.pos
    while (isIdentifierChar(s.peek())) s.advance()
    const text = s.input.slice(start, s.pos)
    if (text === "") {
      s.fail('Expected a build identifier after "+" or "."')
    }
    identifiers.push(text)
    if (s.peek() === ".") {
      s.advance()
      continue
    }
    break
  }
  return identifiers
}

function readVersion(s: Scanner): SemVer {
  const major = readNumericField(s, "major")
  s.expect(".", 'Expected "." after the major version')
  const minor = readNumericField(s, "minor")
  s.expect(".", 'Expected "." after the minor version')
  const patch = readNumericField(s, "patch")

  let prerelease: (string | number)[] = []
  if (s.peek() === "-") {
    s.advance()
    prerelease = readPrerelease(s)
  }

  let build: string[] = []
  if (s.peek() === "+") {
    s.advance()
    build = readBuild(s)
  }

  if (!s.atEnd()) {
    s.fail(`Unexpected character "${s.peek()}"`)
  }

  return { major, minor, patch, prerelease, build }
}

/**
 * Parses a single semantic version string (e.g. "1.2.3-beta.1+build.5").
 * Throws SemverParseError, with the offending column pointed to directly,
 * on anything that isn't valid SemVer 2.0.0.
 */
export function parseVersion(input: string): SemVer {
  const scanner = new Scanner(input)
  try {
    return readVersion(scanner)
  } catch (err) {
    if (err instanceof ScanError) {
      throw new SemverParseError(err.message, 1, err.pos + 1, input)
    }
    throw err
  }
}

/** Same as parseVersion, but returns a result instead of throwing. */
export function tryParseVersion(input: string): ParseResult {
  try {
    return { ok: true, value: parseVersion(input) }
  } catch (err) {
    if (err instanceof SemverParseError) {
      return { ok: false, error: err }
    }
    throw err
  }
}

export function format(version: SemVer): string {
  let text = `${version.major}.${version.minor}.${version.patch}`
  if (version.prerelease.length > 0) {
    text += "-" + version.prerelease.join(".")
  }
  if (version.build.length > 0) {
    text += "+" + version.build.join(".")
  }
  return text
}

function compareIdentifier(a: string | number, b: string | number): -1 | 0 | 1 {
  const aIsNumber = typeof a === "number"
  const bIsNumber = typeof b === "number"
  if (aIsNumber && bIsNumber) {
    if (a === b) return 0
    return a < b ? -1 : 1
  }
  if (aIsNumber !== bIsNumber) {
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    return aIsNumber ? -1 : 1
  }
  const aText = a as string
  const bText = b as string
  if (aText === bText) return 0
  return aText < bText ? -1 : 1
}

function comparePrerelease(a: (string | number)[], b: (string | number)[]): -1 | 0 | 1 {
  if (a.length === 0 && b.length === 0) return 0
  // A version with no pre-release has higher precedence than one that has one.
  if (a.length === 0) return 1
  if (b.length === 0) return -1

  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    if (i >= a.length) return -1
    if (i >= b.length) return 1
    const result = compareIdentifier(a[i], b[i])
    if (result !== 0) return result
  }
  return 0
}

/** Standard SemVer 2.0.0 precedence ordering. Build metadata is ignored. */
export function compare(a: SemVer, b: SemVer): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * Parses a small manifest format: one "name@version" pin per line, blank
 * lines and lines starting with "#" ignored. Errors point at the exact
 * line and column of the mistake within the whole document, not just the
 * offending line in isolation.
 */
export function parseManifest(text: string): ManifestEntry[] {
  const entries: ManifestEntry[] = []
  const lines = text.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = i + 1
    const trimmedStart = raw.trimStart()
    if (trimmedStart === "" || trimmedStart.startsWith("#")) continue

    const at = raw.indexOf("@")
    if (at === -1) {
      throw new SemverParseError('Expected "name@version"', line, raw.length + 1, raw)
    }

    const name = raw.slice(0, at).trim()
    if (name === "") {
      throw new SemverParseError('Expected a package name before "@"', line, at + 1, raw)
    }

    const versionText = raw.slice(at + 1)
    try {
      const version = readVersion(new Scanner(versionText))
      entries.push({ name, version, line })
    } catch (err) {
      if (err instanceof ScanError) {
        throw new SemverParseError(err.message, line, at + 2 + err.pos, raw)
      }
      throw err
    }
  }

  return entries
}
