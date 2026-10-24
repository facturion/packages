// Finding → fields: what a client does with a validation message that carries
// an anchor. The rule's table entry is matched against the invoice the message
// is about, from the message's anchor. Without an entry, the anchor itself is
// the best guess (where the rule fired); without an anchor, nothing can be
// pointed at.

import { get, isPrefix, match, tokens, type JsonPointer } from "@facturion/pointer-patterns";
import type { FieldSpec, Kind, Role, RuleTable, Syntax } from "./table.js";

/** A validation finding, as far as fields are concerned. */
export interface Finding {
  /** The rule's code (`BR-S-02`). */
  readonly code: string;
  /** Where the rule fired: a pointer into the invoice. */
  readonly anchor?: JsonPointer | undefined;
}

/** One field a finding concerns. */
export type FieldResult = {
  readonly role: Role;
  /** For a `missing-any` target: the group it satisfies. */
  readonly group?: string;
} & (
  /** A place in the invoice: `present` holds a non-empty value; `absent`
   *  is where the missing value would go. */
  | { readonly state: "present" | "absent"; readonly pointer: JsonPointer }
  /** No entry of the list at `list` has `member` = `value`: the place to add
   *  one. Only targets are reported this way. */
  | { readonly state: "add-entry"; readonly list: JsonPointer; readonly member: readonly [string, ...string[]]; readonly value: string }
);

export type FindingFields =
  /** Mapped by the rule's table entry. */
  | { readonly mapping: "table"; readonly kind: Kind; readonly fields: readonly FieldResult[] }
  /** No entry: the anchor alone, as the field to fix. */
  | { readonly mapping: "location"; readonly fields: readonly [FieldResult] }
  /** No entry, and no anchor (or only the document root). */
  | { readonly mapping: "none"; readonly fields: readonly [] };

const nonEmpty = (v: unknown): boolean =>
  !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0));

/** An `anchored` field keeps only the matches on the anchor's branch: the
 *  anchor is the match, lies inside it, or is one of its containers (not the
 *  document itself, which contains everything). A container counts only if
 *  it supplies every `~.` index; above the list it would widen to every
 *  item. */
function onBranch(spec: FieldSpec, found: JsonPointer, anchor: JsonPointer | undefined): boolean {
  if (anchor === undefined || anchor === "") return false;
  if (isPrefix(found, anchor)) return true;
  const depth = tokens(anchor).length;
  const lastAnchorSegment = spec.pattern.segments.reduce((last, s, i) => (s.kind === "anchor" ? i + 1 : last), 0);
  return isPrefix(anchor, found) && lastAnchorSegment <= depth;
}

/**
 * The fields a finding concerns. `doc` is the invoice the finding is about:
 * the parsed invoice for a received one, the completed draft for one being
 * written. `syntax` picks the entry's variant where UBL and CII differ.
 */
export function fieldsFor(finding: Finding, table: RuleTable, doc: unknown, syntax: Syntax): FindingFields {
  const anchor = finding.anchor;
  const entry = table.get(finding.code);
  if (entry) {
    const m = entry.mappings[syntax];
    if (m.kind === "unrepresentable") return { mapping: "table", kind: m.kind, fields: [] };
    const fields = m.fields.flatMap((spec) => match(spec.pattern, doc, anchor).flatMap((r): FieldResult[] => {
      const group = spec.group === undefined ? {} : { group: spec.group };
      if (r.kind === "add-entry") {
        // "Add one here" is for what has to be fixed: an unmatched filter on a
        // condition or operand (no allowance of that category) is nothing.
        if (spec.role !== "target") return [];
        return [{ role: spec.role, ...group, state: "add-entry", list: r.list, member: r.member, value: r.value }];
      }
      if (spec.anchored && !onBranch(spec, r.pointer, anchor)) return [];
      const present = r.exists && nonEmpty(get(doc, r.pointer));
      return [{ role: spec.role, ...group, state: present ? "present" : "absent", pointer: r.pointer }];
    }));
    return { mapping: "table", kind: m.kind, fields };
  }
  // The document root says nothing about where: no field to point at.
  if (anchor !== undefined && anchor !== "") {
    return { mapping: "location", fields: [{ role: "target", state: nonEmpty(get(doc, anchor)) ? "present" : "absent", pointer: anchor }] };
  }
  return { mapping: "none", fields: [] };
}
