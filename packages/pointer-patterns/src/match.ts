// Matching (SPEC.md §2): a pattern, a document and an optional anchor give
// concrete pointers, including places that don't exist yet.

import { parsePattern, type Pattern, type Segment } from "./pattern.js";
import { child, fromTokens, isIndex, isObject, tokens, type JsonPointer } from "./pointer.js";

/** One result of `match`. */
export type MatchResult =
  /** A place in the document. `exists` says whether `pointer` resolves: a
   *  place that doesn't exist is where the missing value would go. */
  | { readonly kind: "place"; readonly pointer: JsonPointer; readonly exists: boolean }
  /** A filter (`~?member=value`) matched no entry of the list at `list`: the
   *  place to add an entry whose `member` is `value`. */
  | { readonly kind: "add-entry"; readonly list: JsonPointer; readonly member: readonly [string, ...string[]]; readonly value: string };

interface Position {
  readonly toks: readonly string[];
  readonly exists: boolean;
  readonly value: unknown;
}

const at = (p: Position, token: string): Position => {
  const c = p.exists ? child(p.value, token) : { found: false as const };
  return { toks: [...p.toks, token], exists: c.found, value: c.found ? c.value : undefined };
};

const items = (p: Position): readonly unknown[] => (p.exists && Array.isArray(p.value) ? p.value : []);

/** The member a filter tests, followed step by step through objects;
 *  `undefined` when a step is missing or not an object. */
function memberOf(entry: Readonly<Record<string, unknown>>, steps: readonly string[]): unknown {
  let m: unknown = entry;
  for (const k of steps) m = isObject(m) && Object.hasOwn(m, k) ? m[k] : undefined;
  return m;
}

function passes(seg: Extract<Segment, { kind: "filter" }>, entry: unknown): boolean {
  if (!isObject(entry)) return false;
  const m = memberOf(entry, seg.member);
  switch (seg.test.op) {
    case "eq": return m === seg.test.value;
    case "ne": return typeof m === "string" && m !== seg.test.value;
    case "absent": return m === undefined || m === null;
  }
}

/**
 * Resolve a pattern against a document. `anchor` binds `~.` and is the base of
 * a relative pattern; without it, `~.` is `~*` and a relative pattern yields
 * nothing. Results are in document order.
 */
export function match(pattern: Pattern | string, doc: unknown, anchor?: JsonPointer): MatchResult[] {
  const p = typeof pattern === "string" ? parsePattern(pattern) : pattern;
  const anc = anchor === undefined ? null : tokens(anchor);
  let segments: readonly Segment[] = p.segments;
  if (p.kind === "relative") {
    if (!anc || p.up > anc.length) return [];
    segments = [...anc.slice(0, anc.length - p.up).map((key): Segment => ({ kind: "key", key })), ...p.segments];
  }

  let positions: Position[] = [{ toks: [], exists: true, value: doc }];
  const added: MatchResult[] = [];
  let agree = anc !== null; // does the anchor agree with every segment so far?

  segments.forEach((seg, depth) => {
    const here = anc?.[depth];
    const next: Position[] = [];
    for (const pos of positions) {
      switch (seg.kind) {
        case "key":
          next.push(at(pos, seg.key));
          break;
        case "anchor":
          if (agree && here !== undefined && isIndex(here)) {
            next.push(at(pos, here));
            break;
          }
        // falls through: without an index from the anchor, `~.` is `~*`
        case "every":
          items(pos).forEach((value, i) => next.push({ toks: [...pos.toks, String(i)], exists: true, value }));
          break;
        case "filter": {
          const hits: Position[] = [];
          items(pos).forEach((value, i) => {
            if (passes(seg, value)) hits.push({ toks: [...pos.toks, String(i)], exists: true, value });
          });
          if (hits.length) next.push(...hits);
          else if (seg.test.op === "eq") {
            added.push({ kind: "add-entry", list: fromTokens(pos.toks), member: seg.member, value: seg.test.value });
          }
          break;
        }
      }
    }
    positions = next;
    agree = agree && here !== undefined && (seg.kind === "key" ? seg.key === here : isIndex(here));
  });

  const places: MatchResult[] = positions.map((pos) => ({ kind: "place", pointer: fromTokens(pos.toks), exists: pos.exists }));
  return inDocumentOrder([...places, ...added]);
}

const pointerOf = (r: MatchResult): JsonPointer => (r.kind === "place" ? r.pointer : r.list);

// Added-entry results join the others in document order. Within one pattern,
// results can only differ at array indices, so comparing those numerically is
// a total order (and sort is stable for the rest).
function inDocumentOrder(results: MatchResult[]): MatchResult[] {
  const toks = new Map(results.map((r) => [r, tokens(pointerOf(r))]));
  return results.sort((a, b) => {
    const ta = toks.get(a) ?? [], tb = toks.get(b) ?? [];
    for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
      const x = ta[i] ?? "", y = tb[i] ?? "";
      if (x !== y) return isIndex(x) && isIndex(y) ? Number(x) - Number(y) : 0;
    }
    return ta.length - tb.length;
  });
}
