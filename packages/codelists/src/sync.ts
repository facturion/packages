/** Upstream drift detector + label refresher for the codelist YAML sources.
 *
 *  Sources (data/codelists/sources.json):
 *    cldr            — Unicode CLDR (territories / currencies), one file per
 *                      declared locale. Permissive (Unicode-3.0) — the reason
 *                      localized country/currency names come from here, not the
 *                      LGPL Debian iso-codes. Drives multilingual labels.
 *    peppol-codelist — docs.peppol.eu JSON (Apache-2.0), EAS schemes + country.
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
 *
 *  Runs on plain Node (built-in fetch) + js-yaml. `npm run sync [-- --flag]`. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import yaml from "js-yaml";

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
};

// ── upstream fetchers ───────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "@facturion/codelists sync" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** code -> { [locale]: label }. The shared shape every fetcher returns. */
type UpstreamRow = { code: string; labels: Record<string, string>; country?: string };

const COUNTRY_PSEUDO = new Set(["EU", "UN", "QO", "ZZ", "EZ", "XA", "XB", "XK"]);

interface CldrSpec { format: "cldr"; kind: "territories" | "currencies"; urlTemplate: string }
interface PeppolSpec { format: "peppol-codelist"; url: string; codeField: string; labelField: string; stateField?: string; activeState?: string }
type SourceSpec = CldrSpec | PeppolSpec;

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

async function fetchPeppol(spec: PeppolSpec): Promise<UpstreamRow[]> {
  const data = await fetchJson(spec.url) as { values?: Array<Record<string, unknown>> };
  if (!Array.isArray(data.values)) throw new Error(`Missing "values" array in peppol payload`);
  const rows = spec.stateField ? data.values.filter((v) => v[spec.stateField!] === spec.activeState) : data.values;
  const seen = new Map<string, UpstreamRow>();
  for (const v of rows) {
    const code = v[spec.codeField] as string | undefined;
    if (!code || seen.has(code)) continue;
    const label = (v[spec.labelField] as string | undefined) ?? code;
    const country = (v.country as string | undefined) ?? undefined;
    seen.set(code, { code, labels: { [CFG.default]: label }, country });
  }
  return [...seen.values()];
}

async function fetchUpstream(spec: SourceSpec): Promise<UpstreamRow[]> {
  if (spec.format === "cldr") return fetchCldr(spec);
  if (spec.format === "peppol-codelist") return fetchPeppol(spec);
  throw new Error(`Unknown fetcher format: ${(spec as { format: string }).format}`);
}

// ── local YAML ──────────────────────────────────────────────────────────────

interface YamlEntry { code: string; iso3?: string; country?: string; preferred?: boolean; label?: Record<string, string>; hint?: Record<string, string> }
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
  if (file === "icd-schemes.yaml" && e.country) lines.push(`    country: ${q(e.country)}`);
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
    if (file === "icd-schemes.yaml" && r.country) e.country = r.country;
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
      if (r.file === "icd-schemes.yaml" && e.country) entry.country = e.country;
      out.push(emitEntry(entry, r.file));
    }
    out.push("");
  }
  if (!any) out.push("(no new codes)");
  return out.join("\n");
}

async function main(): Promise<void> {
  const sources = JSON.parse(readFileSync(join(DATA_DIR, "sources.json"), "utf8")) as Record<string, SourceSpec>;
  const files = Object.keys(sources).filter((k) => k.endsWith(".yaml"));
  const reports: Report[] = [];
  for (const file of files) {
    try { reports.push(await diffOne(file, sources[file]!)); }
    catch (err) { reports.push({ file, error: (err as Error).message }); }
  }

  if (MODE.json) process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
  else {
    process.stdout.write(renderHuman(reports));
    if (MODE.suggest) process.stdout.write(renderSuggestions(reports) + "\n");
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

  if (MODE.check && reports.some((r) => r.stale?.length)) process.exit(1);
}

main().catch((err) => { process.stderr.write(`sync failed: ${(err as Error).stack ?? err}\n`); process.exit(2); });
