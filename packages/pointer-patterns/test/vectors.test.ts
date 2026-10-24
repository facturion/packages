// The language-neutral vectors (vectors.json, written from SPEC.md by hand)
// against this implementation. Results compare in the vectors' JSON form:
// {pointer, exists} for a place, {pointer, exists: false, entry} for an
// entry to add.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { match, parsePattern, pointer, type MatchResult } from "../src/index.js";

interface Vectors {
  documents: Record<string, unknown>;
  parse: { valid: string[]; invalid: { pattern: string; why: string }[] };
  match: { name: string; doc: string; cases: { pattern: string; anchor?: string; results: unknown[] }[] }[];
}
const v = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8")) as Vectors;

const wire = (r: MatchResult) =>
  r.kind === "place"
    ? { pointer: r.pointer, exists: r.exists }
    : { pointer: r.list, exists: false, entry: { member: r.member.join("/"), value: r.value } };

test("parse: valid patterns", () => {
  for (const p of v.parse.valid) assert.doesNotThrow(() => parsePattern(p), p);
});

test("parse: invalid patterns", () => {
  for (const { pattern, why } of v.parse.invalid) assert.throws(() => parsePattern(pattern), SyntaxError, `${pattern}: ${why}`);
});

for (const group of v.match) {
  test(`match: ${group.name}`, () => {
    const doc = v.documents[group.doc];
    for (const c of group.cases) {
      const anchor = c.anchor === undefined ? undefined : pointer(c.anchor);
      assert.deepEqual(match(c.pattern, doc, anchor).map(wire), c.results, `${c.pattern} @ ${c.anchor ?? "(none)"}`);
    }
  });
}

test("vectors: all counted", () => {
  const n = v.parse.valid.length + v.parse.invalid.length + v.match.reduce((s, g) => s + g.cases.length, 0);
  assert.equal(n, 109);
});
