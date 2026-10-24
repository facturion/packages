/** Fields by their EN 16931 code: `field(doc, "BT-10")`.
 *
 *  Reading is over the document (`Invoice`: a parsed invoice, or a draft run
 *  through `completeInvoice`), writing over the input (`InvoiceInput`), each
 *  with its own map (generated/fields.ts), so a computed value (BT-112) can't
 *  be set and a caller-only field never shadows the document's own (BT-113).
 *
 *  A code inside a list has a value per entry. `field` returns all of them,
 *  located; `fieldIn` / `setFieldIn` take one entry of the code's group (a
 *  line for BT-153), typed as that entry. Lists grow through `addEntry` /
 *  `addEntryIn`. Writes mutate in place, so a reactive proxy over the input
 *  sees them; `undefined` removes a value and the objects it leaves empty. */

import { fromTokens, get, match, parsePattern, type JsonPointer, type Pattern } from "@facturion/pointer-patterns";
import { READ_FIELDS, WRITE_FIELDS, type FieldTypes, type InputFieldTypes } from "../generated/fields.js";
import type { Invoice, InvoiceInput } from "../generated/invoice-types.js";

export type { FieldTypes, InputFieldTypes };
export { READ_FIELDS, WRITE_FIELDS };

type ReadMap = typeof READ_FIELDS;
type WriteMap = typeof WRITE_FIELDS;

type Where<M, Cond> = { [C in keyof M]: M[C] extends Cond ? C : never }[keyof M];

/** Every code a document has. */
export type FieldCode = keyof ReadMap;
/** Every code an input can be given. */
export type SettableCode = keyof WriteMap;

/** One value per invoice. */
export type SingleCode = Where<ReadMap, { many: false }>;
/** One value per entry of a list: read with `field` (all) or `fieldIn` (one). */
export type ManyCode = Where<ReadMap, { many: true }>;
/** A code inside a list entry, and the list code whose entries hold it. */
export type GroupedCode = Where<ReadMap, { group: string }>;
type GroupOf<M, C extends keyof M> = M[C] extends { group: infer G extends keyof M } ? G : never;
/** A grouped code that is a list of its own within the entry (BG-27 in a line). */
type ListIn<M> = Where<M, { rel: `${string}~*` }>;

/** Settable with `setField`: one value per invoice, not a list. */
export type SettableSingleCode = Where<WriteMap, { many: false }>;
/** Settable with `setFieldIn`, within one entry of its group. */
export type SettableGroupedCode = Exclude<Where<WriteMap, { group: string }>, ListIn<WriteMap>>;
/** A list `addEntry` adds to (BG-25, BT-29): not inside another list. */
export type ListCode = Exclude<Where<WriteMap, { many: true }>, Where<WriteMap, { group: string }>>;
/** A list within a group's entry, for `addEntryIn`. */
export type GroupedListCode = ListIn<WriteMap> & keyof WriteMap;

/** A value and where it is. */
export interface Located<T> {
  readonly pointer: JsonPointer;
  readonly value: T;
}

const patterns = new Map<string, Pattern>();
const compiled = (source: string): Pattern => {
  let p = patterns.get(source);
  if (!p) patterns.set(source, (p = parsePattern(source)));
  return p;
};

function located(pattern: string, doc: unknown): Located<unknown>[] {
  const out: Located<unknown>[] = [];
  for (const r of match(compiled(pattern), doc)) {
    if (r.kind === "place" && r.exists) out.push({ pointer: r.pointer, value: get(doc, r.pointer) });
  }
  return out;
}

/** A code's value in `doc`: the value (or undefined) for a single code, every
 *  entry's for a code inside a list. */
export function field<C extends SingleCode>(doc: Invoice, code: C): FieldTypes[C] | undefined;
export function field<C extends ManyCode>(doc: Invoice, code: C): Located<FieldTypes[C]>[];
export function field(doc: Invoice, code: FieldCode): unknown {
  const entry = READ_FIELDS[code];
  const found = located(entry.pattern, doc);
  return entry.many ? found : found[0]?.value;
}

/** A grouped code's value in one entry of its group (`entry`: a line for
 *  BT-153). A list within the entry (BG-27) comes back located, relative to it. */
export function fieldIn<C extends Exclude<GroupedCode, ListIn<ReadMap>>>(
  entry: FieldTypes[GroupOf<ReadMap, C>],
  code: C,
): FieldTypes[C] | undefined;
export function fieldIn<C extends GroupedCode & ListIn<ReadMap>>(
  entry: FieldTypes[GroupOf<ReadMap, C>],
  code: C,
): Located<FieldTypes[C]>[];
export function fieldIn(entry: unknown, code: GroupedCode): unknown {
  const e = READ_FIELDS[code] as { rel: string };
  const found = located(`/${e.rel}`, entry);
  return e.rel.endsWith("~*") ? found : found[0]?.value;
}

/** Set `value` at `toks` under `root`, creating objects on the way; undefined
 *  removes it and the objects it leaves empty. */
function write(target: object, toks: readonly string[], value: unknown): void {
  const root = target as Record<string, any>;
  if (value === undefined) {
    const chain: Record<string, any>[] = [root];
    for (const t of toks.slice(0, -1)) {
      const next = chain.at(-1)![t];
      if (!next || typeof next !== "object") return;
      chain.push(next);
    }
    delete chain.at(-1)![toks.at(-1)!];
    for (let i = chain.length - 1; i > 0; i--) {
      if (Object.keys(chain[i]!).length) break;
      delete chain[i - 1]![toks[i - 1]!];
    }
    return;
  }
  let node = root;
  for (const t of toks.slice(0, -1)) {
    if (!node[t] || typeof node[t] !== "object") node[t] = {};
    node = node[t];
  }
  node[toks.at(-1)!] = value;
}

// The maps' patterns use plain member names and `~*` only (no escapes).
const toksOf = (pattern: string) => pattern.split("/").slice(1);

/** Set a code in `input`, or remove it with `undefined`. An object code
 *  (BT-49: id and scheme) is set whole. */
export function setField<C extends SettableSingleCode>(input: InvoiceInput, code: C, value: InputFieldTypes[C] | undefined): void {
  write(input, toksOf(WRITE_FIELDS[code].pattern), value);
}

/** Set a grouped code in one entry of its group (a line for BT-153). */
export function setFieldIn<C extends SettableGroupedCode>(
  entry: InputFieldTypes[GroupOf<WriteMap, C>],
  code: C,
  value: InputFieldTypes[C] | undefined,
): void {
  write(entry as object, toksOf(`/${(WRITE_FIELDS[code] as { rel: string }).rel}`), value);
}

function append(target: object, listToks: readonly string[], value: unknown): JsonPointer {
  let node = target as Record<string, any>;
  for (const t of listToks.slice(0, -1)) {
    if (!node[t] || typeof node[t] !== "object") node[t] = {};
    node = node[t];
  }
  const key = listToks.at(-1)!;
  if (!Array.isArray(node[key])) node[key] = [];
  node[key].push(value);
  return fromTokens([...listToks, String(node[key].length - 1)]);
}

/** Add an entry to a list (BG-25: a line); returns where it went. */
export function addEntry<C extends ListCode>(input: InvoiceInput, code: C, value: InputFieldTypes[C]): JsonPointer {
  return append(input, toksOf(WRITE_FIELDS[code].pattern).slice(0, -1), value);
}

/** Add an entry to a list within one entry of its group (BG-27: an allowance
 *  on a line); returns where it went, relative to `entry`. */
export function addEntryIn<C extends GroupedListCode>(
  entry: InputFieldTypes[GroupOf<WriteMap, C>],
  code: C,
  value: InputFieldTypes[C],
): JsonPointer {
  return append(entry as object, toksOf(`/${(WRITE_FIELDS[code] as { rel: string }).rel}`).slice(0, -1), value);
}
