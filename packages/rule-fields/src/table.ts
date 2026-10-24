// Rule tables: which fields of an invoice a validation rule concerns, and in
// what role. Loaded and checked once (`loadTable`), so every entry that
// reaches `fieldsFor` is well-formed by construction.

import { parsePattern, type Pattern } from "@facturion/pointer-patterns";

/** The invoice syntaxes a rule can fire in; an entry may map each its own way. */
export const SYNTAXES = ["ubl", "cii"] as const;
export type Syntax = (typeof SYNTAXES)[number];

/** What kind of problem a rule reports. */
export const KINDS = ["missing", "missing-any", "invalid", "forbidden", "inconsistent", "structural", "unrepresentable"] as const;
export type Kind = (typeof KINDS)[number];

/** A field's part in a rule: `target` is the field to fix; `condition` a
 *  field whose value made the rule apply; `operand` an input of a calculation
 *  (whose result is the target) or one side of a comparison with no derived
 *  side. */
export const ROLES = ["target", "condition", "operand"] as const;
export type Role = (typeof ROLES)[number];

/** One field a rule concerns, as a pattern. */
export interface FieldSpec {
  readonly pattern: Pattern;
  readonly role: Role;
  /** The field applies only on the anchor's branch (for rules that fire on
   *  different kinds of object, each with its own target). Absolute patterns
   *  only. */
  readonly anchored: boolean;
  /** For `missing-any` targets: one target per group must be present. */
  readonly group?: string;
}

/** How a rule maps to fields. A rule the invoice model has no fields for maps
 *  to none; every other rule names at least one. */
export type Mapping =
  | { readonly kind: "unrepresentable" }
  | { readonly kind: Exclude<Kind, "unrepresentable">; readonly fields: readonly [FieldSpec, ...FieldSpec[]] };

export interface RuleEntry {
  readonly code: string;
  /** The mapping, per syntax (an entry without syntax variants maps both alike). */
  readonly mappings: Readonly<Record<Syntax, Mapping>>;
  /** For the person checking the invoice. */
  readonly note?: string;
  /** Maintainer notes, never shown: why a generator can't trip the rule, how
   *  the mapping was decided, why an anchor check report is accepted. */
  readonly generator?: string;
  readonly remark?: string;
  readonly anchor?: string;
}

/** Rule code → entry. */
export type RuleTable = ReadonlyMap<string, RuleEntry>;

/** A table that doesn't follow the format, with every problem found. */
export class TableError extends Error {
  readonly problems: readonly string[];
  constructor(name: string, problems: readonly string[]) {
    super(`${name}: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    this.name = "TableError";
    this.problems = problems;
  }
}

const ENTRY_KEYS = new Set(["kind", "fields", "syntax", "note", "generator", "remark", "anchor"]);
const VARIANT_KEYS = new Set(["kind", "fields"]);
const FIELD_KEYS = new Set(["path", "role", "anchored", "group"]);

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * Check a table's JSON (`{ "rules": { code: entry } }`, the format of
 * `tables/*.json`) and turn it into a `RuleTable`. Throws a `TableError`
 * listing every problem: unknown kinds, roles or keys, unparsable patterns,
 * a `group` outside a `missing-any` target, `anchored` on a relative pattern,
 * fields on an unrepresentable rule or none on any other.
 */
export function loadTable(json: unknown, name = "table"): RuleTable {
  const problems: string[] = [];
  const out = new Map<string, RuleEntry>();
  const rules = isRecord(json) ? json["rules"] : undefined;
  if (!isRecord(rules)) throw new TableError(name, ['no "rules" object']);

  for (const [code, raw] of Object.entries(rules)) {
    const at = (msg: string) => problems.push(`${code}: ${msg}`);
    if (!isRecord(raw)) { at("not an object"); continue; }
    for (const k of Object.keys(raw)) if (!ENTRY_KEYS.has(k)) at(`unknown key "${k}"`);

    const base = mapping(raw, undefined, at);
    const variants = raw["syntax"];
    if (variants !== undefined && !isRecord(variants)) at('"syntax" is not an object');
    const bySyntax = {} as Record<Syntax, Mapping>;
    for (const s of SYNTAXES) {
      const v = isRecord(variants) ? variants[s] : undefined;
      if (v !== undefined && !isRecord(v)) { at(`syntax.${s} is not an object`); continue; }
      if (v) for (const k of Object.keys(v)) if (!VARIANT_KEYS.has(k)) at(`syntax.${s}: unknown key "${k}"`);
      const m = v ? mapping(v, raw, (msg) => at(`syntax.${s}: ${msg}`)) : base;
      if (m) bySyntax[s] = m;
    }
    if (isRecord(variants)) for (const k of Object.keys(variants)) if (!oneOf(SYNTAXES, k)) at(`unknown syntax "${k}"`);
    if (!SYNTAXES.every((s) => bySyntax[s])) continue;

    const text = (k: "note" | "generator" | "remark" | "anchor") => {
      const v = raw[k];
      if (v === undefined) return {};
      if (typeof v !== "string") { at(`"${k}" is not a string`); return {}; }
      return { [k]: v };
    };
    out.set(code, { code, mappings: bySyntax, ...text("note"), ...text("generator"), ...text("remark"), ...text("anchor") });
  }
  if (problems.length) throw new TableError(name, problems);
  return out;
}

/** An entry's (or a syntax variant's) mapping; a variant inherits what it
 *  doesn't state from `parent`. */
function mapping(
  src: Readonly<Record<string, unknown>>,
  parent: Readonly<Record<string, unknown>> | undefined,
  at: (msg: string) => void,
): Mapping | undefined {
  const kind = src["kind"] ?? parent?.["kind"];
  const rawFields = src["fields"] ?? parent?.["fields"] ?? [];
  if (!oneOf(KINDS, kind)) { at(`unknown kind ${JSON.stringify(kind)}`); return undefined; }
  if (!Array.isArray(rawFields)) { at('"fields" is not a list'); return undefined; }
  const fields = rawFields.map((f, i) => field(f, kind, (msg) => at(`fields[${i}]: ${msg}`))).filter((f): f is FieldSpec => f !== undefined);
  if (fields.length !== rawFields.length) return undefined;

  if (kind === "unrepresentable") {
    if (fields.length) { at("an unrepresentable rule names no fields"); return undefined; }
    return { kind };
  }
  const [first, ...rest] = fields;
  if (!first) { at(`a ${kind} rule names at least one field`); return undefined; }
  return { kind, fields: [first, ...rest] };
}

function field(raw: unknown, kind: Kind, at: (msg: string) => void): FieldSpec | undefined {
  if (!isRecord(raw)) { at("not an object"); return undefined; }
  for (const k of Object.keys(raw)) if (!FIELD_KEYS.has(k)) at(`unknown key "${k}"`);
  const { path, role, anchored = false, group } = raw;
  if (typeof path !== "string") { at('"path" is not a string'); return undefined; }
  if (!oneOf(ROLES, role)) { at(`unknown role ${JSON.stringify(role)}`); return undefined; }
  if (typeof anchored !== "boolean") { at('"anchored" is not a boolean'); return undefined; }
  let pattern: Pattern;
  try {
    pattern = parsePattern(path);
  } catch (e) {
    at(`${path}: ${(e as Error).message}`);
    return undefined;
  }
  if (anchored && pattern.kind === "relative") { at(`${path}: "anchored" needs an absolute pattern`); return undefined; }
  if (group !== undefined) {
    if (typeof group !== "string" || group === "") { at('"group" is not a name'); return undefined; }
    if (kind !== "missing-any" || role !== "target") { at(`${path}: "group" is for the targets of a missing-any rule`); return undefined; }
    return { pattern, role, anchored, group };
  }
  return { pattern, role, anchored };
}

/** Several tables as one; a rule in more than one is an error (each rule set
 *  maps its own rules). */
export function mergeTables(...tables: readonly RuleTable[]): RuleTable {
  const out = new Map<string, RuleEntry>();
  const twice: string[] = [];
  for (const t of tables) for (const [code, e] of t) {
    if (out.has(code)) twice.push(`${code}: in more than one table`);
    out.set(code, e);
  }
  if (twice.length) throw new TableError("merged tables", twice);
  return out;
}
