import { ScanError, SemverParseError } from "./errors.js"
import { Scanner, readVersionBody, compare } from "./parser.js"
import type { SemVer } from "./parser.js"

export type ComparatorOperator = "=" | ">" | ">=" | "<" | "<="

export interface Comparator {
  operator: ComparatorOperator
  version: SemVer
}

/** Comparators within a set are ANDed together. */
export interface ComparatorSet {
  comparators: Comparator[]
}

/** Sets are ORed together: a version satisfies the range if it satisfies any one set. */
export interface Range {
  sets: ComparatorSet[]
}

function skipSpaces(s: Scanner): void {
  while (s.peek() === " " || s.peek() === "\t") s.advance()
}

function readOperator(s: Scanner): ComparatorOperator {
  const ch = s.peek()
  if (ch === ">") {
    s.advance()
    if (s.peek() === "=") {
      s.advance()
      return ">="
    }
    return ">"
  }
  if (ch === "<") {
    s.advance()
    if (s.peek() === "=") {
      s.advance()
      return "<="
    }
    return "<"
  }
  if (ch === "=") {
    s.advance()
    return "="
  }
  return "="
}

function bumpMajor(v: SemVer): SemVer {
  return { major: v.major + 1, minor: 0, patch: 0, prerelease: [], build: [] }
}

function bumpMinor(v: SemVer): SemVer {
  return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: [], build: [] }
}

function bumpPatch(v: SemVer): SemVer {
  return { major: v.major, minor: v.minor, patch: v.patch + 1, prerelease: [], build: [] }
}

/**
 * ^1.2.3 allows changes that don't modify the left-most non-zero digit,
 * matching how npm treats a caret range for a fully specified version.
 */
function expandCaret(v: SemVer): Comparator[] {
  const upper = v.major > 0 ? bumpMajor(v) : v.minor > 0 ? bumpMinor(v) : bumpPatch(v)
  return [
    { operator: ">=", version: v },
    { operator: "<", version: upper },
  ]
}

/** ~1.2.3 allows patch-level changes only. */
function expandTilde(v: SemVer): Comparator[] {
  return [
    { operator: ">=", version: v },
    { operator: "<", version: bumpMinor(v) },
  ]
}

function readComparators(s: Scanner): Comparator[] {
  const ch = s.peek()
  if (ch === "^") {
    s.advance()
    return expandCaret(readVersionBody(s))
  }
  if (ch === "~") {
    s.advance()
    return expandTilde(readVersionBody(s))
  }
  const operator = readOperator(s)
  const version = readVersionBody(s)
  return [{ operator, version }]
}

function readComparatorSet(s: Scanner): ComparatorSet {
  const comparators = readComparators(s)
  while (true) {
    skipSpaces(s)
    if (s.atEnd() || s.peek() === "|") break
    comparators.push(...readComparators(s))
  }
  return { comparators }
}

/**
 * Parses a range expression: one or more comparator sets separated by
 * "||", each set made of whitespace-separated comparators that are ANDed
 * together. Supports explicit comparators (">=1.2.3", "1.2.3") plus the
 * "^" and "~" shorthands, expanded into their equivalent bounds.
 *
 * Examples: "^1.2.3", "~1.2.3 || >=2.0.0 <3.0.0", ">=1.0.0 <2.0.0".
 */
export function parseRange(input: string): Range {
  const scanner = new Scanner(input)
  try {
    const sets: ComparatorSet[] = []
    skipSpaces(scanner)
    sets.push(readComparatorSet(scanner))
    while (true) {
      skipSpaces(scanner)
      if (scanner.atEnd()) break
      scanner.expect("|", 'Expected "||" between comparator sets')
      scanner.expect("|", 'Expected "||" between comparator sets')
      skipSpaces(scanner)
      sets.push(readComparatorSet(scanner))
    }
    return { sets }
  } catch (err) {
    if (err instanceof ScanError) {
      throw new SemverParseError(err.message, 1, err.pos + 1, input)
    }
    throw err
  }
}

function matchesComparator(version: SemVer, comparator: Comparator): boolean {
  const result = compare(version, comparator.version)
  switch (comparator.operator) {
    case "=":
      return result === 0
    case ">":
      return result > 0
    case ">=":
      return result >= 0
    case "<":
      return result < 0
    case "<=":
      return result <= 0
  }
}

/**
 * Tests a version against a parsed range. A version satisfies the range if
 * it satisfies every comparator in at least one of the range's sets.
 */
export function satisfies(version: SemVer, range: Range): boolean {
  return range.sets.some((set) => set.comparators.every((c) => matchesComparator(version, c)))
}
