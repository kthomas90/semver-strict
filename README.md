# semver-strict

A strict SemVer 2.0.0 parser and comparator for TypeScript. No dependencies.

Most semver parsers tell you a string is invalid and stop there. If you paste
`1.02.3` into one, you get `Error: Invalid Version` and you're left staring at
the string trying to figure out which part is wrong. That's fine when a human
typed the version by hand into a prompt, but it's useless when the version
comes from a config file, a manifest, or user input in a form, and you need
to tell someone exactly what to fix.

This library parses versions by hand, character by character, and every
failure carries the line and column of the exact character that broke the
grammar, plus a caret pointing at it. The error message is meant to be shown
to a human as-is.

## Install

There's no package published yet. Copy `src/` into your project, or once
this is published:

```
npm install semver-strict
```

## Usage

### Parsing a version

```ts
import { parseVersion } from "semver-strict"

const version = parseVersion("1.4.2-beta.1+exp.sha.5114f85")
// { major: 1, minor: 4, patch: 2, prerelease: ["beta", 1], build: ["exp", "sha", "5114f85"] }
```

### What a parse failure looks like

```ts
parseVersion("1.02.3")
```

throws a `SemverParseError` whose `message` is:

```
The minor version must not have a leading zero (line 1, column 3)
  1.02.3
    ^
```

Every field gets this treatment: missing dots, empty pre-release
identifiers, leading zeros in numeric identifiers, stray trailing
characters, all of it points at the exact offending character.

```ts
parseVersion("1.2.3extra")
```

```
Unexpected character "e" (line 1, column 6)
  1.2.3extra
       ^
```

If you'd rather not deal with a thrown exception, use `tryParseVersion`:

```ts
import { tryParseVersion } from "semver-strict"

const result = tryParseVersion(input)
if (!result.ok) {
  console.error(result.error.message)
} else {
  console.log(result.value.major)
}
```

### Comparing and formatting

```ts
import { compare, format, parseVersion } from "semver-strict"

const a = parseVersion("1.2.3")
const b = parseVersion("1.10.0")

compare(a, b) // -1
format(a) // "1.2.3"
```

`compare` follows SemVer 2.0.0 precedence rules exactly, including
pre-release identifier comparison (`1.0.0-alpha` < `1.0.0-alpha.1` <
`1.0.0-beta` < `1.0.0`). Build metadata is ignored, per spec.

### Parsing a manifest

Real projects usually need to validate more than one version at a time.
`parseManifest` reads a small `name@version` per line format (blank lines
and `#` comments are skipped) and reports errors with the correct line
number for the whole document, not just the line in isolation:

```ts
import { parseManifest } from "semver-strict"

const text = `
# core dependencies
left-pad@3.2.1
redis@1.2.x
`

parseManifest(text)
```

```
Expected a numeric patch version (line 4, column 11)
  redis@1.2.x
            ^
```

### Parsing a range

`parseRange` reads the range syntax used for dependency constraints:
comparators (`>=1.2.3`, `<2.0.0`), the `^` and `~` shorthands, whitespace
to AND comparators together, and `||` to OR whole comparator sets.

```ts
import { parseRange } from "semver-strict"

parseRange("^1.2.3")
// { sets: [ { comparators: [
//   { operator: ">=", version: 1.2.3 },
//   { operator: "<", version: 2.0.0 },
// ] } ] }

parseRange("~1.2.3 || >=2.0.0 <3.0.0")
```

`^` and `~` are expanded eagerly into their equivalent bounds, so callers
never need to special-case them: `^1.2.3` becomes `>=1.2.3 <2.0.0`, `^0.2.3`
becomes `>=0.2.3 <0.3.0`, and `~1.2.3` becomes `>=1.2.3 <1.3.0`. Errors use
the same line/column reporting as `parseVersion`.

There's no `satisfies()` yet to test a version against a parsed range —
that's next.

## API

- `parseVersion(input: string): SemVer` — parse one version string, throw `SemverParseError` on failure.
- `tryParseVersion(input: string): ParseResult` — same, without throwing.
- `parseManifest(text: string): ManifestEntry[]` — parse a `name@version` per line document.
- `parseRange(input: string): Range` — parse a comparator range, expanding `^` and `~`.
- `compare(a: SemVer, b: SemVer): -1 | 0 | 1` — SemVer 2.0.0 precedence.
- `format(version: SemVer): string` — serialize back to a version string.
- `SemverParseError` — carries `.line`, `.column`, and `.lineText` in addition to `.message`.

## License

MIT
