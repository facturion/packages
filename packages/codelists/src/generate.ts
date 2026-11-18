/** Generate the package's committed artifacts from the YAML sources:
 *    generated/index.ts            typed code arrays, *_PREFERRED, *_ENTRIES,
 *                                  CODES/PREFERRED maps, CodelistName union
 *    generated/buckets/<locale>.ts per-locale label/hint/plural bucket module
 *    generated/buckets/index.ts    BUCKETS map + LOCALES + DEFAULT_LOCALE
 *
 *  N-locale: loops the declared locales (data/codelists/locales.json). A
 *  locale bucket carries only the labels present for that locale; the runtime
 *  falls back to the default locale, then to the raw code. `generateAll()` is
 *  pure (returns path -> content) so the drift test can compare without I/O.
 *
 *  Run: `npm run generate` (tsx src/generate.ts). */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { validateCodelist, validateOverlay, type Family, type LocaleConfig, type ParsedCodelist } from "./schema.js";

/** Ascend from this module until we find `data/codelists/locales.json`, so the
 *  same code works whether run from `src/` (tsx) or `dist/src/` (built). */
function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "data", "codelists", "locales.json"))) return dir;
    dir = resolve(dir, "..");
  }
  throw new Error("Could not locate data/codelists/locales.json above generate.ts");
}

const PKG_ROOT = findPackageRoot();
const DATA_DIR = join(PKG_ROOT, "data", "codelists");
const GEN_DIR = join(PKG_ROOT, "generated");
/** Editorial layer over the generated scheme lists (see the file's header). */
const OVERLAY_FILE = join(PKG_ROOT, "data", "overlays", "schemes.yaml");

/** file -> family + the SCREAMING_CASE base for its generated exports. Keep
 *  alphabetical by file so the generated diff is stable. */
const FAMILIES: ReadonlyArray<{ file: string; family: Family; tsExport: string }> = [
  { file: "classification-schemes.yaml", family: "default",     tsExport: "CLASSIFICATION_SCHEMES" },
  { file: "countries.yaml",              family: "countries",   tsExport: "COUNTRIES" },
  { file: "currencies.yaml",             family: "default",     tsExport: "CURRENCIES" },
  { file: "eas-schemes.yaml",            family: "schemes",     tsExport: "EAS_SCHEMES" },
  { file: "icd-schemes.yaml",            family: "schemes",     tsExport: "ICD_SCHEMES" },
  { file: "invoice-types.yaml",          family: "default",     tsExport: "INVOICE_TYPES" },
  { file: "payment-means.yaml",          family: "default",     tsExport: "PAYMENT_MEANS" },
  { file: "tax-point-date.yaml",         family: "default",     tsExport: "TAX_POINT_DATE" },
  { file: "units.yaml",                  family: "units",       tsExport: "UNITS" },
  { file: "vat-categories.yaml",         family: "default",     tsExport: "VAT_CATEGORY" },
];

interface Loaded {
  family: Family;
  tsExport: string;
  bucket: string;
  parsed: ParsedCodelist;
}

function readLocaleConfig(): LocaleConfig {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, "locales.json"), "utf8")) as Partial<LocaleConfig>;
  if (!Array.isArray(raw.locales) || raw.locales.length === 0 || typeof raw.default !== "string") {
    throw new Error("locales.json must define { locales: string[], default: string }");
  }
  if (!raw.locales.includes(raw.default)) {
    throw new Error(`locales.json default "${raw.default}" is not in locales`);
  }
  return { locales: raw.locales, default: raw.default };
}

function loadAll(cfg: LocaleConfig): Loaded[] {
  const onDisk = new Set(readdirSync(DATA_DIR).filter((f) => f.endsWith(".yaml")));
  const expected = new Set(FAMILIES.map((f) => f.file));
  for (const f of onDisk) if (!expected.has(f)) throw new Error(`Unregistered YAML in data/codelists: ${f}`);
  for (const f of expected) if (!onDisk.has(f)) throw new Error(`Missing YAML file: data/codelists/${f}`);
  const loaded = FAMILIES.map((spec) => {
    const parsed = yaml.load(readFileSync(join(DATA_DIR, spec.file), "utf8"));
    validateCodelist(spec.file, parsed, spec.family, cfg);
    return { family: spec.family, tsExport: spec.tsExport, bucket: parsed.bucket, parsed };
  });
  applyOverlay(loaded.filter((l) => l.family === "schemes"), cfg);
  return loaded;
}

/** Merge the editorial overlay into the generated scheme lists, by code. A
 *  label override replaces the published name per locale; `preferred` and
 *  `hint` are added. An overlay code that no list carries is an error: the
 *  scheme was retired upstream and its editorial entry should go too. */
function applyOverlay(lists: Loaded[], cfg: LocaleConfig): void {
  const file = "data/overlays/schemes.yaml";
  const overlay = yaml.load(readFileSync(OVERLAY_FILE, "utf8"));
  validateOverlay(file, overlay, cfg);
  for (const o of overlay.entries) {
    let found = false;
    for (const l of lists) {
      const e = l.parsed.entries.find((x) => x.code === o.code);
      if (!e) continue;
      found = true;
      if (o.label) e.label = { ...e.label, ...o.label };
      if (o.hint) e.hint = { ...o.hint };
      if (o.preferred) e.preferred = true;
      if (o.country) {
        // Fills a missing upstream tag only; once upstream tags the scheme,
        // the overlay entry is stale and must go.
        if (e.country) throw new Error(`${file}: code "${o.code}" already has country "${e.country}" upstream (${l.bucket}) — remove the overlay country`);
        e.country = o.country;
      }
    }
    if (!found) throw new Error(`${file}: code "${o.code}" is in no scheme list (retired upstream?) — remove its entry`);
  }
}

const q = JSON.stringify;
const banner = "// Generated by @facturion/codelists generate.ts from data/codelists/*.yaml.\n// Do not edit by hand.\n";

/** Per-locale flat bucket data. Carries only labels present for `locale`;
 *  missing ones fall back at runtime. Shape: { bucket: { code, code_hint, code_plural } }. */
function buildBucketData(loaded: Loaded[], locale: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const { bucket, parsed, family: fam } of loaded) {
    const table: Record<string, string> = {};
    for (const e of parsed.entries) {
      const label = e.label[locale];
      if (label !== undefined) table[e.code] = label;
      if (fam === "units" && e.plural?.[locale] !== undefined) table[`${e.code}_plural`] = e.plural[locale]!;
      if (e.hint?.[locale] !== undefined) table[`${e.code}_hint`] = e.hint[locale]!;
    }
    out[bucket] = table;
  }
  return out;
}

/** Per-locale typed bucket module (the runtime import target). */
function emitBucketModule(data: Record<string, Record<string, string>>): string {
  return `${banner}const data: Record<string, Record<string, string>> = ${JSON.stringify(data, null, 2)};\nexport default data;\n`;
}

/** Per-locale raw JSON bucket — a build-free data artifact for external
 *  consumers (e.g. Facturion stages these into its i18n bundle). */
function emitBucketJson(data: Record<string, Record<string, string>>): string {
  return JSON.stringify(data, null, 2) + "\n";
}

function emitBucketsIndex(cfg: LocaleConfig): string {
  const lines: string[] = [banner];
  for (const loc of cfg.locales) lines.push(`import ${jsId(loc)} from ${q("./" + loc + ".js")};`);
  lines.push("");
  lines.push("export const BUCKETS: Record<string, Record<string, Record<string, string>>> = {");
  for (const loc of cfg.locales) lines.push(`  ${q(loc)}: ${jsId(loc)},`);
  lines.push("};");
  lines.push(`export const LOCALES: readonly string[] = [${cfg.locales.map((l) => q(l)).join(", ")}];`);
  lines.push(`export const DEFAULT_LOCALE = ${q(cfg.default)};`);
  lines.push("");
  return lines.join("\n");
}

/** A safe JS identifier for a locale tag used as an import binding (e.g. pt-BR). */
function jsId(loc: string): string {
  return "loc_" + loc.replace(/[^a-zA-Z0-9_$]/g, "_");
}

function emitIndex(loaded: Loaded[]): string {
  const lines: string[] = [banner];
  lines.push("export type CountryEntry = { code: string; iso3: string };");
  lines.push("/** A scheme and the country it belongs to (ISO-2, or \"international\"). */");
  lines.push("export type SchemeEntry = { code: string; country?: string };");
  lines.push("/** @deprecated Use SchemeEntry. */");
  lines.push("export type IcdSchemeEntry = SchemeEntry;");
  lines.push("");
  lines.push(`export const CODELIST_NAMES = [${loaded.map((l) => q(l.bucket)).join(", ")}] as const;`);
  lines.push("export type CodelistName = (typeof CODELIST_NAMES)[number];");
  lines.push("");

  const preferredExports: string[] = [];
  for (const l of loaded) {
    const codes = l.parsed.entries.map((e) => q(e.code)).join(", ");
    lines.push(`export const ${l.tsExport}_CODES = [${codes}] as const;`);
    const preferred = l.parsed.entries.filter((e) => e.preferred === true).map((e) => q(e.code));
    if (preferred.length) {
      lines.push(`export const ${l.tsExport}_PREFERRED = [${preferred.join(", ")}] as const;`);
      preferredExports.push(`  ${l.bucket}: ${l.tsExport}_PREFERRED,`);
    }
    if (l.family === "countries") {
      lines.push("export const COUNTRIES_ENTRIES: readonly CountryEntry[] = [");
      for (const e of l.parsed.entries) lines.push(`  { code: ${q(e.code)}, iso3: ${q(e.iso3 ?? "")} },`);
      lines.push("];");
    }
    if (l.family === "schemes") {
      lines.push(`export const ${l.tsExport}_ENTRIES: readonly SchemeEntry[] = [`);
      for (const e of l.parsed.entries) {
        const c = e.country ? `, country: ${q(e.country)}` : "";
        lines.push(`  { code: ${q(e.code)}${c} },`);
      }
      lines.push("];");
    }
  }
  lines.push("");
  lines.push("export const CODES: Record<CodelistName, readonly string[]> = {");
  for (const l of loaded) lines.push(`  ${l.bucket}: ${l.tsExport}_CODES,`);
  lines.push("};");
  lines.push("");
  lines.push("export const PREFERRED: Record<string, readonly string[]> = {");
  for (const line of preferredExports) lines.push(line);
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

function emitReadme(): string {
  return [
    "# Generated codelists",
    "",
    "Do not edit files in this directory by hand. They are emitted by",
    "`src/generate.ts` from the YAML sources in `data/codelists/`.",
    "",
    "To change a list: edit the relevant `data/codelists/*.yaml`, then run",
    "`npm run generate`. The drift test fails if the committed outputs are",
    "out of sync with the YAML sources.",
    "",
    "The identifier-scheme lists (`icd-schemes.yaml`, `eas-schemes.yaml`) are",
    "themselves generated from their upstreams by `npm run sync -- --schemes`;",
    "their editorial additions live in `data/overlays/schemes.yaml`.",
    "",
  ].join("\n");
}

/** Pure: path -> content for every generated file. */
export function generateAll(): Record<string, string> {
  const cfg = readLocaleConfig();
  const loaded = loadAll(cfg);
  const out: Record<string, string> = {};
  for (const loc of cfg.locales) {
    const data = buildBucketData(loaded, loc);
    out[join(GEN_DIR, "buckets", `${loc}.ts`)] = emitBucketModule(data);
    out[join(GEN_DIR, "buckets", `${loc}.json`)] = emitBucketJson(data);
  }
  out[join(GEN_DIR, "buckets", "index.ts")] = emitBucketsIndex(cfg);
  out[join(GEN_DIR, "index.ts")] = emitIndex(loaded);
  out[join(GEN_DIR, "README.md")] = emitReadme();
  return out;
}

// CLI entrypoint.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  for (const [path, content] of Object.entries(generateAll())) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  process.stdout.write(`Generated codelist artifacts into ${GEN_DIR}\n`);
}
