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
  ICD_SCHEMES_ENTRIES,
  type CodelistName,
  type CountryEntry,
  type IcdSchemeEntry,
} from "../generated/index.js";
import type { CodelistOption, OptionOpts, Locale } from "./types.js";

export type { CodelistOption, OptionOpts, Locale } from "./types.js";
export type { CodelistName, CountryEntry, IcdSchemeEntry } from "../generated/index.js";
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

/** EAS/ICD scheme codes valid for a country (`""` = all). Country-agnostic
 *  schemes (`international`, or no country) are always included. */
export function icdSchemesForCountry(country: string): string[] {
  if (!country) return ICD_SCHEMES_ENTRIES.map((e) => e.code);
  return ICD_SCHEMES_ENTRIES.filter(
    (e) => !e.country || e.country === "international" || e.country === country,
  ).map((e) => e.code);
}

/** EAS/ICD scheme picker options, optionally scoped to a country, preferred
 *  set floated above a divider. Pass `country = ""` to show every scheme. */
export function icdSchemeOptions(country: string, locale: Locale, opts: OptionOpts = {}): CodelistOption[] {
  const allowed = new Set(icdSchemesForCountry(country));
  const codes = CODES["icdSchemes"].filter((c) => allowed.has(c));
  return buildOptions("icdSchemes", codes, locale, { preferredFirst: true, ...opts });
}

export function countryEntries(): CountryEntry[] {
  return COUNTRIES_ENTRIES.map((e) => ({ ...e }));
}
export function icdSchemeEntries(): IcdSchemeEntry[] {
  return ICD_SCHEMES_ENTRIES.map((e) => ({ ...e }));
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
