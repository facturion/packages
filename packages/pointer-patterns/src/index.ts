// @facturion/pointer-patterns — JSON Pointer patterns: a strict superset of
// JSON Pointer (RFC 6901) that names sets of places in a document, including
// places that don't exist yet. See SPEC.md.

export { parsePattern } from "./pattern.js";
export type { Pattern, Segment, FilterTest } from "./pattern.js";
export { match } from "./match.js";
export type { MatchResult } from "./match.js";
export { pointer, tokens, fromTokens, get, isPrefix, ROOT, PatternSyntaxError } from "./pointer.js";
export type { JsonPointer } from "./pointer.js";
