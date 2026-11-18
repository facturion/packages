/** Pure parsers + merge for the identifier-scheme lists (ISO 6523 ICD and CEF
 *  EAS). Kept free of I/O so they can be unit-tested on fixtures; `sync.ts`
 *  fetches the upstream documents and hands their text in.
 *
 *  Upstreams (see data/codelists/sources.json → "schemes"):
 *    codes   CEN EN 16931 validation artefacts (EUPL-1.2), the codes schematron:
 *            the exact sets rules BR-CL-10/11 (ICD) and BR-CL-25 (EAS) accept.
 *            This decides WHICH codes each list carries.
 *    names   ISO 6523 scheme names from OpenPEPPOL's ICD list; for EAS-only
 *            codes, Peppol's participant identifier schemes, then KoSIT's EAS
 *            list. Names are published registry data.
 *    country Peppol participant identifier schemes (Apache-2.0), joined by code.
 *
 *  The XML inputs are simple, flat documents; a small regex reader is enough
 *  and keeps the package dependency-free. Each parser throws when it finds
 *  nothing, so a changed upstream shape fails loudly instead of emptying a list. */

export interface SchemeRow {
  code: string;
  name: string;
  country?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode XML entities and collapse whitespace (names wrap across lines). */
export function xmlText(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^"(.*)"$/, "$1");
}

/** The code set a CEN codes-schematron rule accepts: the space-separated list in
 *  the `contains(' … ', …)` test of the assert whose id is `ruleId`. */
export function schematronCodes(sch: string, ruleId: string): string[] {
  const at = sch.search(new RegExp(`id="${ruleId}"`));
  if (at < 0) throw new Error(`schematron: no assert with id="${ruleId}"`);
  const start = sch.lastIndexOf("<assert", at);
  const assert = sch.slice(start, at);
  const m = assert.match(/contains\(\s*'([^']+)'/);
  if (!m) throw new Error(`schematron: ${ruleId} has no contains(' … ') code list`);
  const codes = m[1]!.trim().split(/\s+/);
  if (!codes.length) throw new Error(`schematron: ${ruleId} lists no codes`);
  return codes;
}

/** OpenPEPPOL "VEFA" code list XML: `<Code><Id>…</Id><Name>…</Name>…</Code>`. */
export function vefaNames(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<Code>\s*<Id>([^<]+)<\/Id>\s*<Name>([\s\S]*?)<\/Name>/g)) {
    out.set(xmlText(m[1]!), xmlText(m[2]!));
  }
  if (!out.size) throw new Error("VEFA code list: no <Code> entries found");
  return out;
}

/** Genericode rows: one map of ColumnRef → value per `<Row>`. */
export function genericodeRows(xml: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  for (const r of xml.matchAll(/<Row>([\s\S]*?)<\/Row>/g)) {
    const row: Record<string, string> = {};
    for (const v of r[1]!.matchAll(/<Value ColumnRef="([^"]+)">\s*<SimpleValue>([\s\S]*?)<\/SimpleValue>/g)) {
      row[v[1]!] = xmlText(v[2]!);
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error("genericode: no <Row> entries found");
  return rows;
}

export interface PeppolScheme {
  code: string;
  name: string;
  country: string;
  active: boolean;
}

/** Peppol participant identifier schemes JSON (`values[]`). */
export function peppolSchemes(json: unknown): PeppolScheme[] {
  const values = (json as { values?: Array<Record<string, unknown>> }).values;
  if (!Array.isArray(values) || !values.length) throw new Error('Peppol schemes: missing "values" array');
  return values
    .filter((v) => typeof v.iso6523 === "string")
    .map((v) => ({
      code: String(v.iso6523),
      name: String(v["scheme-name"] ?? ""),
      country: String(v.country ?? ""),
      active: v.state === "active",
    }));
}

/** A country tag the YAML accepts: ISO-2, or "international". */
function countryTag(c: string | undefined): string | undefined {
  if (!c) return undefined;
  if (c === "international" || /^[A-Z]{2}$/.test(c)) return c;
  return undefined;
}

export interface SchemeInputs {
  icdCodes: string[];
  easCodes: string[];
  icdNames: Map<string, string>;
  peppol: PeppolScheme[];
  /** KoSIT EAS genericode rows (`aesc`, `scheme-name`). */
  kositEas: Array<Record<string, string>>;
}

/** Build both lists. Codes come only from the schematron sets; a code without
 *  any upstream name keeps the code itself as its name (and is reported). */
export function buildSchemeLists(input: SchemeInputs): { icd: SchemeRow[]; eas: SchemeRow[]; unnamed: string[] } {
  // Country: an active Peppol entry wins over a retired one for the same code.
  const country = new Map<string, string>();
  for (const p of [...input.peppol].sort((a, b) => Number(a.active) - Number(b.active))) {
    const c = countryTag(p.country);
    if (c) country.set(p.code, c);
  }
  const peppolName = new Map(input.peppol.filter((p) => p.name).map((p) => [p.code, p.name]));
  const kositName = new Map(input.kositEas.filter((r) => r.aesc && r["scheme-name"]).map((r) => [r.aesc!, r["scheme-name"]!]));
  const unnamed: string[] = [];

  const row = (code: string, ...sources: Array<Map<string, string>>): SchemeRow => {
    const name = sources.map((s) => s.get(code)).find(Boolean);
    if (!name) unnamed.push(code);
    const r: SchemeRow = { code, name: name ?? code };
    const c = country.get(code);
    if (c) r.country = c;
    return r;
  };
  const sorted = (codes: string[]) => [...new Set(codes)].sort();
  // An EAS 0xxx code is an ISO 6523 scheme: prefer its ICD name.
  return {
    icd: sorted(input.icdCodes).map((c) => row(c, input.icdNames)),
    eas: sorted(input.easCodes).map((c) => row(c, input.icdNames, peppolName, kositName)),
    unnamed: sorted(unnamed),
  };
}
