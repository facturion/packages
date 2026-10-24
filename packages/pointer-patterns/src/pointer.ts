// JSON Pointer (RFC 6901): parsing, building and evaluation.

declare const brand: unique symbol;

/** A syntactically valid JSON Pointer (RFC 6901): `""` or `/`-prefixed
 *  reference tokens. Obtain one from `pointer()`, `fromTokens()` or a match
 *  result; a plain string isn't one until it has been checked. */
export type JsonPointer = string & { readonly [brand]: "JsonPointer" };

/** The whole document. */
export const ROOT = "" as JsonPointer;

/** A pattern or pointer that doesn't match the grammar, with the offset of the
 *  first problem. */
export class PatternSyntaxError extends SyntaxError {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = "PatternSyntaxError";
    this.offset = offset;
  }
}

const ESCAPE = /~([^]|$)/g;

/** Decode one reference token's `~0` / `~1` escapes; `at` is its offset in
 *  the source, for errors. */
export function decodeToken(raw: string, at: number): string {
  return raw.replace(ESCAPE, (m, c: string, i: number) => {
    if (c === "1") return "/";
    if (c === "0") return "~";
    throw new PatternSyntaxError(`invalid escape "${m}"`, at + i);
  });
}

const encodeToken = (t: string): string => t.replace(/~/g, "~0").replace(/\//g, "~1");

/** Check a string is a JSON Pointer. */
export function pointer(s: string): JsonPointer {
  tokensOf(s);
  return s as JsonPointer;
}

function tokensOf(s: string): string[] {
  if (s === "") return [];
  if (s[0] !== "/") throw new PatternSyntaxError(`not a JSON Pointer: "${s}"`, 0);
  let at = 1;
  return s.slice(1).split("/").map((raw) => {
    const t = decodeToken(raw, at);
    at += raw.length + 1;
    return t;
  });
}

/** A pointer's decoded reference tokens. */
export function tokens(p: JsonPointer): string[] {
  return tokensOf(p);
}

/** The pointer for decoded reference tokens. */
export function fromTokens(toks: readonly string[]): JsonPointer {
  return toks.map((t) => "/" + encodeToken(t)).join("") as JsonPointer;
}

/** An array index as RFC 6901 writes it: `0`, or digits without a leading zero. */
export const isIndex = (t: string): boolean => /^(0|[1-9][0-9]*)$/.test(t);

type Step = { readonly found: true; readonly value: unknown } | { readonly found: false };

/** One step down: an object's own member, or an array element in range. */
export function child(node: unknown, token: string): Step {
  if (Array.isArray(node)) {
    return isIndex(token) && Number(token) < node.length ? { found: true, value: node[Number(token)] } : { found: false };
  }
  if (isObject(node) && Object.hasOwn(node, token)) return { found: true, value: node[token] };
  return { found: false };
}

/** A JSON object (not an array, not null). */
export const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** RFC 6901 evaluation: the value at `p`, or `undefined` when it doesn't
 *  resolve. (A JSON document can't hold `undefined`, so the two can't be
 *  confused.) */
export function get(doc: unknown, p: JsonPointer): unknown {
  let node = doc;
  for (const t of tokens(p)) {
    const c = child(node, t);
    if (!c.found) return undefined;
    node = c.value;
  }
  return node;
}

/** `a` is `b` or an ancestor of it, token-wise (`/line` is not a prefix of
 *  `/lines`). */
export function isPrefix(a: JsonPointer, b: JsonPointer): boolean {
  const ta = tokens(a), tb = tokens(b);
  return ta.length <= tb.length && ta.every((t, i) => t === tb[i]);
}
