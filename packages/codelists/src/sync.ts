/** Upstream drift detector + label refresher for the codelist YAML sources.
 *
 *  Sources (data/codelists/sources.json):
 *    cldr            — Unicode CLDR (territories / currencies), one file per
 *                      declared locale. Permissive (Unicode-3.0) — the reason
 *                      localized country/currency names come from here, not the
 *                      LGPL Debian iso-codes. Drives multilingual labels.
 *    schemes         — ISO 6523 ICD + CEF EAS, from the CEN EN 16931 codes
 *                      schematron (which codes), ISO 6523 / Peppol / KoSIT
 *                      (names) and Peppol (country). See schemes-upstream.ts.
 *
 *  Modes:
 *    (default)   human report of stale/new codes per list
 *    --json      machine-readable
 *    --check     exit 1 if any list has codes missing upstream (possible retirement)
 *    --suggest   print paste-ready YAML for new upstream codes
 *    --apply     append new upstream codes to each YAML
 *    --relabel   rewrite labels of EXISTING codes from upstream for every
 *                declared locale (cldr lists only). This is the MIT-clean
 *                label refresh; preserves code/iso3/preferred, regenerates the
 *                entries block, keeps the file header intact.
 *    --schemes   regenerate icd-schemes.yaml and eas-schemes.yaml wholesale
 *                from their upstreams. Editorial data lives in
 *                data/overlays/schemes.yaml and is untouched.
 *
 *  Runs on plain Node (built-in fetch) + js-yaml. `npm run sync [-- --flag]`. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import yaml from "js-yaml";
import {
  buildSchemeLists,
  genericodeRows,
  peppolSchemes,
  schematronCodes,
  vefaNames,
  type SchemeRow,
} from "./schemes-upstream.js";

function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "data", "codelists", "locales.json"))) return dir;
    dir = resolve(dir, "..");
  }
  throw new Error("Could not locate data/codelists/locales.json above sync.ts");
}

const PKG_ROOT = findPackageRoot();
const DATA_DIR = join(PKG_ROOT, "data", "codelists");

interface LocaleConfig { locales: string[]; default: string }
const CFG: LocaleConfig = JSON.parse(readFileSync(join(DATA_DIR, "locales.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const MODE = {
  json: args.has("--json"),
  check: args.has("--check"),
  suggest: args.has("--suggest"),
  apply: args.has("--apply"),
  relabel: args.has("--relabel"),
  schemes: args.has("--schemes"),
};

// ── upstream fetchers ───────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "@facturion/codelists sync" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse(await fetchText(url));
}

/** code -> { [locale]: label }. The shared shape every fetcher returns. */
type UpstreamRow = { code: string; labels: Record<string, string>; country?: string };

const COUNTRY_PSEUDO = new Set(["EU", "UN", "QO", "ZZ", "EZ", "XA", "XB", "XK"]);

interface CldrSpec { format: "cldr"; kind: "territories" | "currencies"; urlTemplate: string }
type SourceSpec = CldrSpec;

async function fetchCldr(spec: CldrSpec): Promise<UpstreamRow[]> {
  const byCode = new Map<string, Record<string, string>>();
  for (const loc of CFG.locales) {
    const url = spec.urlTemplate.replace("{locale}", loc);
    const data = await fetchJson(url) as Record<string, unknown>;
    const main = (data.main as Record<string, unknown> | undefined)?.[loc] as Record<string, unknown> | undefined;
    let table: Record<string, string> = {};
    if (spec.kind === "territories") {
      table = ((main?.localeDisplayNames as Record<string, unknown> | undefined)?.territories ?? {}) as Record<string, string>;
    } else {
      const currencies = ((main?.numbers as Record<string, unknown> | undefined)?.currencies ?? {}) as Record<string, { displayName?: string }>;
      for (const [code, v] of Object.entries(currencies)) if (v.displayName) table[code] = v.displayName;
    }
    for (const [rawCode, label] of Object.entries(table)) {
      if (rawCode.includes("-")) continue; // skip alt forms (US-alt-short, …)
      if (spec.kind === "territories" && (!/^[A-Z]{2}$/.test(rawCode) || COUNTRY_PSEUDO.has(rawCode))) continue;
      if (spec.kind === "currencies" && !/^[A-Z]{3}$/.test(rawCode)) continue;
      if (typeof label !== "string") continue;
      const rec = byCode.get(rawCode) ?? {};
      rec[loc] = label;
      byCode.set(rawCode, rec);
    }
  }
  return [...byCode].map(([code, labels]) => ({ code, labels }));
}

async function fetchUpstream(spec: SourceSpec): Promise<UpstreamRow[]> {
  if (spec.format === "cldr") return fetchCldr(spec);
  throw new Error(`Unknown fetcher format: ${(spec as { format: string }).format}`);
}

// ── local YAML ──────────────────────────────────────────────────────────────

interface YamlEntry { code: string; iso3?: string; preferred?: boolean; label?: Record<string, string>; hint?: Record<string, string> }
interface YamlList { bucket: string; entries: YamlEntry[] }

function readYaml(file: string): YamlList {
  return yaml.load(readFileSync(join(DATA_DIR, file), "utf8")) as YamlList;
}

const q = (s: unknown) => JSON.stringify(String(s ?? ""));

function flowLabel(labels: Record<string, string>): string {
  const parts = CFG.locales.filter((l) => labels[l] !== undefined).map((l) => `${l}: ${q(labels[l])}`);
  return `{ ${parts.join(", ")} }`;
}

/** Re-emit one entry in the project's YAML style (block entry, flow label). */
function emitEntry(e: YamlEntry, file: string): string {
  const lines = [`  - code: ${q(e.code)}`];
  if (file === "countries.yaml" && e.iso3) lines.push(`    iso3: ${q(e.iso3)}`);
  if (e.preferred) lines.push(`    preferred: true`);
  lines.push(`    label: ${flowLabel(e.label ?? {})}`);
  return lines.join("\n");
}

/** Keep the file header up to and including the `entries:` line, then emit fresh entries. */
function rewriteEntries(file: string, entries: YamlEntry[]): void {
  const original = readFileSync(join(DATA_DIR, file), "utf8");
  const idx = original.indexOf("\nentries:");
  if (idx < 0) throw new Error(`${file}: no "entries:" key found`);
  const header = original.slice(0, idx + "\nentries:".length);
  const body = entries.map((e) => emitEntry(e, file)).join("\n");
  writeFileSync(join(DATA_DIR, file), `${header}\n${body}\n`);
}

// ── diff + report ─────────────────────────────────────────────────────────────

interface Report {
  file: string; bucket?: string; skipped?: boolean; reason?: string; error?: string;
  stale?: string[]; newUpstream?: UpstreamRow[]; localCount?: number; upstreamCount?: number;
}

async function diffOne(file: string, spec: SourceSpec): Promise<Report> {
  const parsed = readYaml(file);
  const local = new Set(parsed.entries.map((e) => String(e.code)));
  const upstream = await fetchUpstream(spec);
  const upstreamCodes = new Set(upstream.map((u) => u.code));
  const stale = [...local].filter((c) => !upstreamCodes.has(c)).sort();
  const newUpstream = upstream.filter((u) => !local.has(u.code)).sort((a, b) => a.code.localeCompare(b.code));
  return { file, bucket: parsed.bucket, stale, newUpstream, localCount: local.size, upstreamCount: upstream.length };
}

function applyNew(file: string, rows: UpstreamRow[]): void {
  const original = readFileSync(join(DATA_DIR, file), "utf8").replace(/\s+$/, "");
  const blocks = rows.map((r) => {
    const e: YamlEntry = { code: r.code, label: r.labels };
    if (file === "countries.yaml") e.iso3 = "XXX";
    return emitEntry(e, file);
  });
  writeFileSync(join(DATA_DIR, file), `${original}\n${blocks.join("\n")}\n`);
}

/** Refresh labels of existing entries from upstream (cldr lists). */
function relabel(file: string, rows: UpstreamRow[]): number {
  const parsed = readYaml(file);
  const byCode = new Map(rows.map((r) => [r.code, r.labels]));
  let changed = 0;
  for (const e of parsed.entries) {
    const up = byCode.get(e.code);
    if (!up) continue;
    const next: Record<string, string> = { ...(e.label ?? {}) };
    for (const loc of CFG.locales) if (up[loc] !== undefined) next[loc] = up[loc];
    if (JSON.stringify(next) !== JSON.stringify(e.label)) changed++;
    e.label = next;
  }
  rewriteEntries(file, parsed.entries);
  return changed;
}

function renderHuman(reports: Report[]): string {
  const out: string[] = ["Codelist sync report", "=".repeat(20), ""];
  for (const r of reports) {
    if (r.skipped) { out.push(`${r.file}: skipped — ${r.reason}`, ""); continue; }
    if (r.error) { out.push(`${r.file}: ERROR — ${r.error}`, ""); continue; }
    out.push(`${r.file} (${r.localCount} local vs ${r.upstreamCount} upstream)`);
    out.push(r.stale?.length ? `  stale (in YAML, not upstream): ${r.stale.join(", ")}` : "  stale: none");
    if (r.newUpstream?.length) {
      out.push(`  new upstream (${r.newUpstream.length}):`);
      for (const e of r.newUpstream.slice(0, 10)) out.push(`    - ${e.code} — ${e.labels[CFG.default] ?? ""}`);
      if (r.newUpstream.length > 10) out.push(`    … ${r.newUpstream.length - 10} more`);
    } else out.push("  new upstream: none");
    out.push("");
  }
  return out.join("\n");
}

function renderSuggestions(reports: Report[]): string {
  const out: string[] = ["", "Suggestions (paste into data/codelists/<file>):", "=".repeat(48), ""];
  let any = false;
  for (const r of reports) {
    if (!r.newUpstream?.length) continue;
    any = true;
    out.push(`# ${r.file}`);
    for (const e of r.newUpstream) {
      const entry: YamlEntry = { code: e.code, label: e.labels };
      if (r.file === "countries.yaml") entry.iso3 = "XXX";
      out.push(emitEntry(entry, r.file));
    }
    out.push("");
  }
  if (!any) out.push("(no new codes)");
  return out.join("\n");
}

// ── identifier schemes (ICD + EAS) ─────────────────────────────────────────

interface SchemesSpec { codes: string; icdRule: string; easRule: string; icdNames: string; peppolSchemes: string; kositEas: string }

async function buildSchemes(spec: SchemesSpec) {
  const [sch, icdXml, peppolJson, kositXml] = await Promise.all([
    fetchText(spec.codes), fetchText(spec.icdNames), fetchJson(spec.peppolSchemes), fetchText(spec.kositEas),
  ]);
  return buildSchemeLists({
    icdCodes: schematronCodes(sch, spec.icdRule),
    easCodes: schematronCodes(sch, spec.easRule),
    icdNames: vefaNames(icdXml),
    peppol: peppolSchemes(peppolJson),
    kositEas: genericodeRows(kositXml),
  });
}

const SCHEME_FILES = {
  icd: { file: "icd-schemes.yaml", name: "ISO/IEC 6523 ICD schemes", bucket: "icdSchemes",
    use: "Identifier and registration schemes: BT-29-1, BT-30-1, BT-46-1, BT-47-1,\n  BT-60-1, BT-61-1, BT-71-1, BT-157-1 (EN 16931 rules BR-CL-10/11)." },
  eas: { file: "eas-schemes.yaml", name: "CEF EAS electronic address schemes", bucket: "easSchemes",
    use: "Electronic address schemes: BT-34-1, BT-49-1 (EN 16931 rule BR-CL-25)." },
} as const;

function emitSchemeYaml(kind: keyof typeof SCHEME_FILES, rows: SchemeRow[], spec: SchemesSpec): string {
  const f = SCHEME_FILES[kind];
  const lines = [
    "# Generated by `npm run sync -- --schemes`. Do not edit by hand: editorial",
    "# additions (preferred, hints, translated labels) go in data/overlays/schemes.yaml.",
    `name: ${f.name}`,
    `bucket: ${f.bucket}`,
    "description: >",
    `  ${f.use}`,
    "  Every code the rule accepts; names as published (ISO 6523 first).",
    "order: by code",
    "upstream:",
    `  codes: ${spec.codes} (${kind === "icd" ? spec.icdRule : spec.easRule})`,
    `  names: ${kind === "icd" ? spec.icdNames : `${spec.icdNames}, ${spec.peppolSchemes}, ${spec.kositEas}`}`,
    `  country: ${spec.peppolSchemes}`,
    "entries:",
  ];
  for (const r of rows) {
    lines.push(`  - code: ${q(r.code)}`);
    if (r.country) lines.push(`    country: ${q(r.country)}`);
    lines.push(`    label: { ${CFG.default}: ${q(r.name)} }`);
  }
  return lines.join("\n") + "\n";
}

function schemeReport(file: string, rows: SchemeRow[]): Report {
  const parsed = existsSync(join(DATA_DIR, file)) ? readYaml(file) : { bucket: "", entries: [] };
  const local = new Set(parsed.entries.map((e) => String(e.code)));
  const up = new Set(rows.map((r) => r.code));
  return {
    file, bucket: parsed.bucket,
    stale: [...local].filter((c) => !up.has(c)).sort(),
    newUpstream: rows.filter((r) => !local.has(r.code)).map((r) => ({ code: r.code, labels: { [CFG.default]: r.name } })),
    localCount: local.size, upstreamCount: rows.length,
  };
}

async function main(): Promise<void> {
  const sources = JSON.parse(readFileSync(join(DATA_DIR, "sources.json"), "utf8")) as Record<string, SourceSpec>;
  const files = Object.keys(sources).filter((k) => k.endsWith(".yaml"));
  const reports: Report[] = [];
  for (const file of files) {
    try { reports.push(await diffOne(file, sources[file]!)); }
    catch (err) { reports.push({ file, error: (err as Error).message }); }
  }
  const schemesSpec = (sources as unknown as { schemes: SchemesSpec }).schemes;
  let schemes: Awaited<ReturnType<typeof buildSchemes>> | null = null;
  try {
    schemes = await buildSchemes(schemesSpec);
    reports.push(schemeReport(SCHEME_FILES.icd.file, schemes.icd), schemeReport(SCHEME_FILES.eas.file, schemes.eas));
  } catch (err) {
    reports.push({ file: "icd-schemes.yaml + eas-schemes.yaml", error: (err as Error).message });
  }

  if (MODE.json) process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
  else {
    process.stdout.write(renderHuman(reports));
    if (MODE.suggest) process.stdout.write(renderSuggestions(reports) + "\n");
  }

  if (MODE.schemes) {
    if (!schemes) { process.stderr.write("schemes: upstream fetch failed, nothing written\n"); process.exit(2); }
    writeFileSync(join(DATA_DIR, SCHEME_FILES.icd.file), emitSchemeYaml("icd", schemes.icd, schemesSpec));
    writeFileSync(join(DATA_DIR, SCHEME_FILES.eas.file), emitSchemeYaml("eas", schemes.eas, schemesSpec));
    process.stderr.write(`schemes: wrote ${schemes.icd.length} ICD and ${schemes.eas.length} EAS entries.\n`);
    if (schemes.unnamed.length) process.stderr.write(`schemes: no upstream name for ${schemes.unnamed.join(", ")} (code used as name)\n`);
    process.stderr.write("Run `npm run generate` next to regenerate artifacts.\n");
  }

  if (MODE.relabel) {
    for (const file of files) {
      const spec = sources[file]!;
      if (spec.format !== "cldr") continue;
      try {
        const rows = await fetchUpstream(spec);
        const n = relabel(file, rows);
        process.stderr.write(`relabel ${file}: refreshed ${n} entr${n === 1 ? "y" : "ies"}\n`);
      } catch (err) { process.stderr.write(`relabel ${file}: ERROR — ${(err as Error).message}\n`); }
    }
    process.stderr.write("Run `npm run generate` next to regenerate artifacts.\n");
  }

  if (MODE.apply) {
    let applied = 0;
    for (const r of reports) {
      if (!r.newUpstream?.length) continue;
      applyNew(r.file, r.newUpstream);
      applied += r.newUpstream.length;
    }
    process.stderr.write(`Appended ${applied} entries. Run \`npm run generate\` next.\n`);
  }

  // Scheme lists are exact copies of their upstream: any difference is drift.
  const schemeDrift = reports.some((r) => r.file.endsWith("-schemes.yaml") && (r.stale?.length || r.newUpstream?.length));
  if (MODE.check && (reports.some((r) => r.stale?.length || r.error) || schemeDrift)) process.exit(1);
}

main().catch((err) => { process.stderr.write(`sync failed: ${(err as Error).stack ?? err}\n`); process.exit(2); });
