/** @facturion/codelists — public runtime API.
 *
 *  Framework-agnostic and zero-runtime-dependency: this module imports only the
 *  generated data. Locale is always an explicit argument; lookups fall back to
 *  the default locale, then to the raw code. Returns plain data — map it onto
 *  your own combobox/select shape. */

import { BUCKETS, LOCALES, DEFAULT_LOCALE } from "../generated/buckets/index.js";
import {
  CODES,
  PREFERRED,
  COUNTRIES_ENTRIES,
  EAS_SCHEMES_ENTRIES,
  ICD_SCHEMES_ENTRIES,
  type CodelistName,
  type CountryEntry,
  type SchemeEntry,
} from "../generated/index.js";
import type { CodelistOption, OptionOpts, Locale } from "./types.js";

export type { CodelistOption, OptionOpts, Locale } from "./types.js";
export type { CodelistName, CountryEntry, SchemeEntry, IcdSchemeEntry } from "../generated/index.js";
export { CODELIST_NAMES } from "../generated/index.js";

function fromBucket(locale: string, bucket: string, key: string): string | undefined {
  return BUCKETS[locale]?.[bucket]?.[key];
}

/** Locale-with-fallback lookup of a single bucket key (`code` or `code_hint`). */
function resolve(bucket: string, key: string, locale: Locale): string | undefined {
  return fromBucket(locale, bucket, key) ?? fromBucket(DEFAULT_LOCALE, bucket, key);
}

/** Friendly label for one code (e.g. `units`,`C62` -> "Unitless"). Returns the
 *  code unchanged when the bucket has no entry, so free-text degrades gracefully. */
export function codelistLabel(name: CodelistName, code: string, locale: Locale): string {
  if (!code) return "";
  return resolve(name, code, locale) ?? code;
}

function hintFor(name: CodelistName, code: string, locale: Locale): string | undefined {
  return resolve(name, `${code}_hint`, locale);
}

/** Plural label for a unit code; falls back to the singular label. */
export function unitLabel(code: string, locale: Locale, plural = false): string {
  if (plural) {
    const p = resolve("units", `${code}_plural`, locale);
    if (p) return p;
  }
  return codelistLabel("units", code, locale);
}

/** Raw `code -> label` map for a whole list in one locale. */
export function getCodelist(name: CodelistName, locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of CODES[name]) out[code] = codelistLabel(name, code, locale);
  return out;
}

function buildOptions(
  name: CodelistName,
  codes: readonly string[],
  locale: Locale,
  opts: OptionOpts,
): CodelistOption[] {
  const preferredSet = new Set<string>(opts.preferred ?? PREFERRED[name] ?? []);
  let options: CodelistOption[] = codes.map((code) => {
    const o: CodelistOption = { value: code, code, label: codelistLabel(name, code, locale) };
    const d = hintFor(name, code, locale);
    if (d) o.description = d;
    if (preferredSet.has(code)) o.preferred = true;
    return o;
  });

  const sort = opts.sort ?? "preserve";
  if (sort === "label") {
    const collator = new Intl.Collator(locale);
    options.sort((a, b) => collator.compare(a.label, b.label));
  } else if (sort === "code") {
    options.sort((a, b) => a.value.localeCompare(b.value));
  }

  if (opts.preferredFirst && preferredSet.size) {
    const top = options.filter((o) => preferredSet.has(o.value));
    const rest = options.filter((o) => !preferredSet.has(o.value));
    if (top.length && rest.length) {
      options = [...top, { value: "", code: "", label: "", divider: true }, ...rest];
    }
  }
  return options;
}

/** Options for a whole list, in source order by default. */
export function codelistOptions(name: CodelistName, locale: Locale, opts: OptionOpts = {}): CodelistOption[] {
  return buildOptions(name, CODES[name], locale, opts);
}

/** Currency options as a two-tier list: preferred set above a divider, then the
 *  long tail. Convenience for `codelistOptions('currencies', …, {preferredFirst:true})`. */
export function currencyOptions(locale: Locale, opts: OptionOpts = {}): CodelistOption[] {
  return buildOptions("currencies", CODES["currencies"], locale, { preferredFirst: true, ...opts });
}

// ── identifier schemes ──────────────────────────────────────────────────────
// Two lists: ISO 6523 ICD (identifier and registration schemes, BT-29-1,
// BT-30-1, BT-46-1, …; EN 16931 BR-CL-10/11) and CEF EAS (electronic address
// schemes, BT-34-1 / BT-49-1; BR-CL-25). They share many 0xxx codes but are not
// interchangeable: EAS-only codes (99xx, EM, …) fail BR-CL-10/11.
//
// A country ranks, it never filters: the schemes relevant to it come first,
// everything else follows a divider. Country tags are incomplete by nature, and
// a scheme hidden by a wrong tag could only be typed blind.

type SchemeList = "icdSchemes" | "easSchemes";
const SCHEME_ENTRIES: Record<SchemeList, readonly SchemeEntry[]> = {
  icdSchemes: ICD_SCHEMES_ENTRIES,
  easSchemes: EAS_SCHEMES_ENTRIES,
};

function relevantTo(e: SchemeEntry, country: string): boolean {
  return !!country && (e.country === country || e.country === "international");
}

/** Codes ranked first for `country`: its own and the international schemes. */
function schemesRankedFirst(list: SchemeList, country: string): string[] {
  return SCHEME_ENTRIES[list].filter((e) => relevantTo(e, country)).map((e) => e.code);
}

/** Every scheme, ranked: with a country, that country's and the international
 *  schemes (preferred ones first), a divider, then the rest; without one, the
 *  preferred set, a divider, then the rest. */
function schemeOptions(list: SchemeList, country: string, locale: Locale, opts: OptionOpts): CodelistOption[] {
  const preferred = new Set<string>(opts.preferred ?? PREFERRED[list] ?? []);
  const entries = SCHEME_ENTRIES[list];
  const top = country
    ? entries.filter((e) => relevantTo(e, country)).map((e) => e.code)
    : entries.filter((e) => preferred.has(e.code)).map((e) => e.code);
  const topSet = new Set(top);
  const rest = entries.map((e) => e.code).filter((c) => !topSet.has(c));
  const base = { ...opts, preferredFirst: false };
  const head = buildOptions(list, top, locale, base);
  // Preferred first within the top group, otherwise source (code) order.
  head.sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred));
  const tail = buildOptions(list, rest, locale, base);
  if (!head.length || !tail.length) return [...head, ...tail];
  return [...head, { value: "", code: "", label: "", divider: true }, ...tail];
}

/** ISO 6523 ICD scheme options (identifier and registration schemes), ranked
 *  for `country` (`""`: preferred first). Every scheme is included. */
export function icdSchemeOptions(country: string, locale: Locale, opts: OptionOpts = {}): CodelistOption[] {
  return schemeOptions("icdSchemes", country, locale, opts);
}

/** CEF EAS scheme options (electronic address schemes), ranked for `country`
 *  (`""`: preferred first). Every scheme is included. */
export function easSchemeOptions(country: string, locale: Locale, opts: OptionOpts = {}): CodelistOption[] {
  return schemeOptions("easSchemes", country, locale, opts);
}

/** ICD codes ranked first for `country` (its own and the international ones);
 *  `""` returns every code. The other codes remain valid. */
export function icdSchemesForCountry(country: string): string[] {
  return country ? schemesRankedFirst("icdSchemes", country) : ICD_SCHEMES_ENTRIES.map((e) => e.code);
}

/** EAS codes ranked first for `country`; `""` returns every code. */
export function easSchemesForCountry(country: string): string[] {
  return country ? schemesRankedFirst("easSchemes", country) : EAS_SCHEMES_ENTRIES.map((e) => e.code);
}

export function countryEntries(): CountryEntry[] {
  return COUNTRIES_ENTRIES.map((e) => ({ ...e }));
}
export function icdSchemeEntries(): SchemeEntry[] {
  return ICD_SCHEMES_ENTRIES.map((e) => ({ ...e }));
}
export function easSchemeEntries(): SchemeEntry[] {
  return EAS_SCHEMES_ENTRIES.map((e) => ({ ...e }));
}
export function preferredCodes(name: CodelistName): string[] {
  return [...(PREFERRED[name] ?? [])];
}
export function locales(): Locale[] {
  return [...LOCALES];
}
export function defaultLocale(): Locale {
  return DEFAULT_LOCALE;
}
