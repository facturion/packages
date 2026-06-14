/** Runtime validation for codelist YAML inputs. One validate() per family;
 *  throws a path-prefixed CodelistError on the first violation so the generator
 *  can surface the offending file + entry. N-locale aware: `label` (and units'
 *  `plural`) must carry the default locale; other declared locales are optional
 *  (runtime falls back). Also performs cross-reference checks the old .mjs
 *  schema lacked (iso3 uniqueness, icd country shape). */

export type Family = "default" | "countries" | "icd-schemes" | "units";

export interface LocaleConfig {
  locales: string[];
  default: string;
}

export class CodelistError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "CodelistError";
  }
}

export interface CodelistEntry {
  code: string;
  label: Record<string, string>;
  hint?: Record<string, string>;
  plural?: Record<string, string>;
  preferred?: boolean;
  iso3?: string;
  country?: string;
}

export interface ParsedCodelist {
  name: string;
  bucket: string;
  entries: CodelistEntry[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function assertString(file: string, value: unknown, where: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CodelistError(file, `${where} must be a non-empty string`);
  }
}

/** A localized text map: keys are declared locales, the default locale is
 *  required, others optional. Unknown locale keys are rejected (typo guard). */
function assertLocaleMap(
  file: string,
  value: unknown,
  where: string,
  cfg: LocaleConfig,
): void {
  if (!isObject(value)) {
    throw new CodelistError(file, `${where} must be a map of locale -> string`);
  }
  const known = new Set(cfg.locales);
  for (const [loc, text] of Object.entries(value)) {
    if (!known.has(loc)) {
      throw new CodelistError(file, `${where} has undeclared locale "${loc}" (declared: ${cfg.locales.join(", ")})`);
    }
    assertString(file, text, `${where}.${loc}`);
  }
  if (value[cfg.default] === undefined) {
    throw new CodelistError(file, `${where} must include the default locale "${cfg.default}"`);
  }
}

export function validateCodelist(
  file: string,
  parsed: unknown,
  family: Family,
  cfg: LocaleConfig,
): asserts parsed is ParsedCodelist {
  if (!isObject(parsed)) throw new CodelistError(file, "root must be a YAML mapping");
  assertString(file, parsed.name, "name");
  assertString(file, parsed.bucket, "bucket");
  if (!Array.isArray(parsed.entries)) throw new CodelistError(file, "entries must be a list");

  const seenCodes = new Set<string>();
  const seenIso3 = new Set<string>();

  parsed.entries.forEach((e: unknown, i: number) => {
    const where = `entries[${i}]`;
    if (!isObject(e)) throw new CodelistError(file, `${where} must be a mapping`);
    assertString(file, e.code, `${where}.code`);
    if (seenCodes.has(e.code)) {
      throw new CodelistError(file, `${where}.code "${e.code}" duplicates an earlier entry`);
    }
    seenCodes.add(e.code);

    assertLocaleMap(file, e.label, `${where}.label`, cfg);

    // plural — units only, same locale rules.
    if (family === "units") {
      if (e.plural === undefined) throw new CodelistError(file, `${where} units family requires "plural"`);
      assertLocaleMap(file, e.plural, `${where}.plural`, cfg);
    } else if (e.plural !== undefined) {
      throw new CodelistError(file, `${where}.plural only allowed on the units family`);
    }

    // hint — any family, optional, same locale rules.
    if (e.hint !== undefined) assertLocaleMap(file, e.hint, `${where}.hint`, cfg);

    // preferred — any family.
    if (e.preferred !== undefined && typeof e.preferred !== "boolean") {
      throw new CodelistError(file, `${where}.preferred must be boolean if present`);
    }

    // iso3 — countries only, 3 letters, unique.
    if (family === "countries") {
      if (typeof e.iso3 !== "string" || !/^[A-Z]{3}$/.test(e.iso3)) {
        throw new CodelistError(file, `${where}.iso3 must be a 3-uppercase-letter string`);
      }
      if (seenIso3.has(e.iso3)) {
        throw new CodelistError(file, `${where}.iso3 "${e.iso3}" duplicates an earlier entry`);
      }
      seenIso3.add(e.iso3);
    } else if (e.iso3 !== undefined) {
      throw new CodelistError(file, `${where}.iso3 only allowed on the countries family`);
    }

    // country — icd-schemes only, ISO-2 or the literal "international".
    if (family === "icd-schemes") {
      if (e.country !== undefined && !(typeof e.country === "string" && (/^[A-Z]{2}$/.test(e.country) || e.country === "international"))) {
        throw new CodelistError(file, `${where}.country must be an ISO-2 code or "international"`);
      }
    } else if (e.country !== undefined) {
      throw new CodelistError(file, `${where}.country only allowed on the icd-schemes family`);
    }
  });
}
