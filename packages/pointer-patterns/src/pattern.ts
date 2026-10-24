// Pattern syntax (SPEC.md §1): parse once, into a form matching can't misread.

import { PatternSyntaxError, decodeToken } from "./pointer.js";

/** A filter's test on an entry's member. */
export type FilterTest =
  /** `~?member=value`: the member is a string equal to `value`. */
  | { readonly op: "eq"; readonly value: string }
  /** `~?member!=value`: the member is a string other than `value`. */
  | { readonly op: "ne"; readonly value: string }
  /** `~?!member`: the member is missing or null. */
  | { readonly op: "absent" };

/** One step of a pattern. */
export type Segment =
  /** A reference token, as in a JSON Pointer. */
  | { readonly kind: "key"; readonly key: string }
  /** `~*`: every item of the array. */
  | { readonly kind: "every" }
  /** `~.`: the anchor's item of the array (every item where the anchor has none). */
  | { readonly kind: "anchor" }
  /** `~?…`: the entries whose member passes the test. `member` lists the steps
   *  of a nested member (`vat~1category_code` → `["vat", "category_code"]`). */
  | { readonly kind: "filter"; readonly member: readonly [string, ...string[]]; readonly test: FilterTest };

/** A parsed pattern. A relative one (`0/scheme_id`) is resolved from an
 *  anchor: `up` tokens are dropped from its end first. */
export type Pattern =
  | { readonly kind: "absolute"; readonly source: string; readonly segments: readonly Segment[] }
  | { readonly kind: "relative"; readonly source: string; readonly up: number; readonly segments: readonly Segment[] };

/** Parse a pattern; throws `PatternSyntaxError` (with the offset) when it
 *  doesn't match the grammar. Parse a table's patterns when it loads, so a
 *  bad one fails there rather than while matching. */
export function parsePattern(source: string): Pattern {
  const rel = /^(0|[1-9][0-9]*)/.exec(source);
  const lead = rel?.[1] ?? "";
  const rest = source.slice(lead.length);
  if (rest !== "" && rest[0] !== "/") {
    throw new PatternSyntaxError(`a pattern starts with "/" or a level count: "${source}"`, lead.length);
  }
  const segments = rest === "" ? [] : segmentsOf(rest.slice(1), lead.length + 1);
  return lead ? { kind: "relative", source, up: Number(lead), segments } : { kind: "absolute", source, segments };
}

function segmentsOf(body: string, offset: number): Segment[] {
  let at = offset;
  return body.split("/").map((raw) => {
    const start = at;
    at += raw.length + 1;
    return segment(raw, start);
  });
}

function segment(raw: string, start: number): Segment {
  if (raw === "~*") return { kind: "every" };
  if (raw === "~.") return { kind: "anchor" };
  if (raw.startsWith("~?!") && !raw.includes("=")) {
    return { kind: "filter", member: member(raw.slice(3), start + 3), test: { op: "absent" } };
  }
  if (raw.startsWith("~?")) {
    const eq = raw.indexOf("=");
    const ne = eq > 2 && raw[eq - 1] === "!";
    const end = ne ? eq - 1 : eq;
    if (eq < 0 || end <= 2) throw new PatternSyntaxError(`a filter is "member=value", "member!=value" or "!member"`, start);
    const value = decodeToken(raw.slice(eq + 1), start + eq + 1);
    return { kind: "filter", member: member(raw.slice(2, end), start + 2), test: ne ? { op: "ne", value } : { op: "eq", value } };
  }
  return { kind: "key", key: decodeToken(raw, start) };
}

// A filter member: "~1" separates the steps of a nested member; "~2" is "="
// and "~3" is "!", which may not appear unescaped.
function member(raw: string, at: number): [string, ...string[]] {
  if (raw.includes("!")) throw new PatternSyntaxError(`"!" in a filter member is written "~3"`, at + raw.indexOf("!"));
  let off = at;
  const steps = raw.split("~1").map((part) => {
    const key = part.replace(/~([^]|$)/g, (m, c: string, i: number) => {
      if (c === "0") return "~";
      if (c === "2") return "=";
      if (c === "3") return "!";
      throw new PatternSyntaxError(`invalid escape "${m}" in a filter member`, off + i);
    });
    if (key === "") throw new PatternSyntaxError("empty step in a filter member", off);
    off += part.length + 2;
    return key;
  });
  const [first, ...more] = steps;
  if (first === undefined) throw new PatternSyntaxError("empty filter member", at);
  return [first, ...more];
}
