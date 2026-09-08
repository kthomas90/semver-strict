/**
 * Thrown by every parsing function in this library. Carries the exact
 * position of the failure so callers (and their users) never have to
 * re-scan a version string by eye to find what's wrong with it.
 */
export class SemverParseError extends Error {
  readonly line: number
  readonly column: number
  readonly lineText: string

  constructor(message: string, line: number, column: number, lineText: string) {
    const indent = "  "
    const caret = " ".repeat(Math.max(column - 1, 0)) + "^"
    super(`${message} (line ${line}, column ${column})\n${indent}${lineText}\n${indent}${caret}`)
    this.name = "SemverParseError"
    this.line = line
    this.column = column
    this.lineText = lineText
  }
}

/**
 * Internal error used while scanning a single, isolated version string.
 * It only knows its offset into that string; the caller (parseVersion or
 * parseManifest) is responsible for translating that offset into a real
 * line and column before it reaches user code.
 */
export class ScanError extends Error {
  readonly pos: number

  constructor(message: string, pos: number) {
    super(message)
    this.pos = pos
  }
}
