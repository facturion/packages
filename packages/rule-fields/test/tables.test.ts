// The shipped tables: they load, they don't overlap, and every absolute
// pattern (and every filter member) names a place the @facturion/invoice
// schema has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Pattern } from "@facturion/pointer-patterns";
import { loadTable, mergeTables, SYNTAXES, type RuleTable } from "../src/index.js";

const NAMES = ["en16931", "xrechnung", "fr", "facturion"] as const;
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../tables/${name}.json`, import.meta.url), "utf8"));
const tables: Record<(typeof NAMES)[number], RuleTable> = Object.fromEntries(NAMES.map((n) => [n, loadTable(read(n), n)])) as never;

type Schema = { readonly [k: string]: unknown };
const schema = JSON.parse(readFileSync(createRequire(import.meta.url).resolve("@facturion/invoice/invoice-schema.json"), "utf8")) as Schema;

/** The schema nodes a step leads to: a property, or an array's items, through
 *  $ref and the combinators. */
function resolve(node: Schema): Schema[] {
  const out: Schema[] = [node];
  const ref = node["$ref"];
  if (typeof ref === "string") {
    const target = ref.replace(/^#\//, "").split("/").reduce<unknown>((n, k) => (n as Schema | undefined)?.[k], schema);
    if (target && typeof target === "object") out.push(...resolve(target as Schema));
  }
  for (const c of ["allOf", "anyOf", "oneOf"]) for (const sub of (node[c] as Schema[] | undefined) ?? []) out.push(...resolve(sub));
  return out;
}
const property = (nodes: Schema[], key: string): Schema[] =>
  nodes.flatMap(resolve).flatMap((n) => {
    const p = (n["properties"] as Record<string, Schema> | undefined)?.[key];
    return p ? resolve(p) : [];
  });
const items = (nodes: Schema[]): Schema[] =>
  nodes.flatMap(resolve).flatMap((n) => (n["items"] && typeof n["items"] === "object" ? resolve(n["items"] as Schema) : []));

/** Problems with a pattern against the schema, or none. */
function schemaProblems(p: Pattern): string[] {
  let nodes = resolve(schema);
  for (const seg of p.segments) {
    if (seg.kind === "key") nodes = /^\d+$/.test(seg.key) ? items(nodes) : property(nodes, seg.key);
    else {
      nodes = items(nodes);
      if (seg.kind === "filter") {
        let m = nodes;
        for (const step of seg.member) m = property(m, step);
        if (!m.length) return [`${p.source}: filter member ${seg.member.join(".")} is not in the schema`];
      }
    }
    if (!nodes.length) return [`${p.source}: not in the schema`];
  }
  return [];
}

test("tables: load, and no rule is in two tables", () => {
  const all = mergeTables(...Object.values(tables));
  assert.equal(all.size, 478);
});

test("tables: every absolute pattern is a place in the invoice schema", () => {
  const problems: string[] = [];
  for (const [name, table] of Object.entries(tables)) {
    for (const entry of table.values()) for (const s of SYNTAXES) {
      const m = entry.mappings[s];
      if (m.kind === "unrepresentable") continue;
      for (const f of m.fields) if (f.pattern.kind === "absolute") problems.push(...schemaProblems(f.pattern).map((x) => `${name} ${entry.code}: ${x}`));
    }
  }
  assert.deepEqual([...new Set(problems)], []);
});
