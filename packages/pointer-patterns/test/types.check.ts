// Compile-time checks of the API's types (`npm test` runs tsc on this file;
// nothing here executes). Each @ts-expect-error marks a misuse the types
// must reject.
import { match, parsePattern, pointer, type MatchResult, type Pattern } from "../src/index.js";

const doc: unknown = {};

// A plain string isn't a pointer until checked.
// @ts-expect-error
match("/lines/~.", doc, "/lines/0");
match("/lines/~.", doc, pointer("/lines/0"));

// A result is a place or an entry to add, never both.
declare const r: MatchResult;
if (r.kind === "place") {
  const exists: boolean = r.exists;
  // @ts-expect-error
  void r.list;
  void exists;
} else {
  const member: readonly [string, ...string[]] = r.member;
  // @ts-expect-error
  void r.exists;
  void member;
}

// Only a relative pattern has a level count.
const p: Pattern = parsePattern("0/scheme_id");
if (p.kind === "relative") void p.up;
// @ts-expect-error
else void p.up;
