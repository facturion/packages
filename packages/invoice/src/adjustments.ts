/** Cross-field consistency of percentage-derived allowances and charges.
 *
 *  An allowance or charge always carries a resolved `amount` (BT-92/99/136/141)
 *  — that is the operative value, the only one the math in `model.ts` reads and
 *  the only one that reaches the totals. `base_amount` and `percentage`
 *  (BT-93/94, BT-100/101, BT-137/138, BT-142/143) document how that amount was
 *  arrived at. Nothing derives the amount from them, here or in the XML
 *  writers; a caller working in percentages resolves the amount itself.
 *
 *  That leaves them free to disagree, and nothing upstream notices. JSON Schema
 *  cannot express arithmetic across sibling properties, and EN 16931 has no
 *  business rule tying the three together — the only schematron assertions that
 *  mention `MultiplierFactorNumeric` (UBL-CR-635, UBL-CR-671) are warnings
 *  about where it may appear, not what it must equal. So an entry reading
 *  `{base_amount: 1000, percentage: 10, amount: 50}` deducts 50, renders as
 *  "10 % of 1,000.00", and passes every validator in the chain. The document
 *  contradicts itself and the receiving AP system reconciles against whichever
 *  field it happens to read.
 *
 *  Hence this check. It is the same class of defect as a wrong VAT rate:
 *  semantically wrong, syntactically impeccable, invisible to schematron.
 *
 *  Strict mode only. `validatePartialInvoice` is for drafts and previews, where
 *  an editor may legitimately hold a percentage whose amount has not been
 *  recomputed yet; holding a half-typed entry to an arithmetic identity would
 *  make the relaxed validator useless for the surface it exists to serve. */

import type { ErrorObject } from "ajv";
import { round2 } from "./model.js";

type Decimal = number | string;

interface Adjustment {
  amount?: Decimal;
  base_amount?: Decimal;
  percentage?: Decimal;
}

/** Every adjustment array in the document, with the JSON Pointer prefix its
 *  entries live under. */
function* adjustmentArrays(
  invoice: Record<string, unknown>,
): Generator<[string, Adjustment[]]> {
  for (const key of ["document_allowances", "document_charges"]) {
    const arr = invoice[key];
    if (Array.isArray(arr)) yield [`/${key}`, arr as Adjustment[]];
  }
  const lines = invoice.lines;
  if (!Array.isArray(lines)) return;
  for (const [i, line] of lines.entries()) {
    if (!line || typeof line !== "object") continue;
    for (const key of ["allowances", "charges"]) {
      const arr = (line as Record<string, unknown>)[key];
      if (Array.isArray(arr)) yield [`/lines/${i}/${key}`, arr as Adjustment[]];
    }
  }
}

/** One cent, counted in whole cents rather than as a 0.01 float — the
 *  comparison happens exactly at the boundary, where `Math.abs(1.00 - 1.01)`
 *  is 0.010000000000000009 and a `<= 0.01` test rejects the very case the
 *  tolerance exists to allow.
 *
 *  The tolerance is not for float noise (`round2` handles that) but for
 *  rounding-mode disagreement: a caller resolving 1.005 half-to-even writes
 *  1.00 where we compute 1.01, and that is a legitimate invoice. Any real
 *  mismatch — a stale amount, a percentage of the wrong base, a hand-edited
 *  figure — is off by far more than a cent. */
const TOLERANCE_CENTS = 1;

const cents = (n: number): number => Math.round(round2(n) * 100);

/** Ajv-shaped errors for every adjustment whose `amount` contradicts its
 *  `base_amount × percentage / 100`. Entries omitting either derivation field
 *  are unconstrained — there is nothing to check against.
 *
 *  Returns Ajv's `ErrorObject` shape so these merge into the existing error
 *  list and any consumer already rendering `.errors` picks them up unchanged.
 *  `keyword: "x-derivation"` marks them as ours rather than the schema's. */
export function checkAdjustmentDerivations(input: unknown): ErrorObject[] {
  if (!input || typeof input !== "object") return [];
  const errors: ErrorObject[] = [];

  for (const [prefix, entries] of adjustmentArrays(input as Record<string, unknown>)) {
    for (const [i, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object") continue;
      const { amount, base_amount: base, percentage: pct } = entry;
      if (amount == null || base == null || pct == null) continue;

      const stated = Number(amount);
      const derived = round2((Number(base) * Number(pct)) / 100);
      if (!Number.isFinite(stated) || !Number.isFinite(derived)) continue;
      if (Math.abs(cents(stated) - cents(derived)) <= TOLERANCE_CENTS) continue;

      errors.push({
        instancePath: `${prefix}/${i}/amount`,
        schemaPath: `${prefix}/${i}/amount/x-derivation`,
        keyword: "x-derivation",
        params: { amount: stated, base_amount: Number(base), percentage: Number(pct), derived },
        message:
          `amount ${stated} contradicts base_amount ${Number(base)} × percentage ` +
          `${Number(pct)}% = ${derived}. The amount is the operative value and ` +
          `must be resolved by the caller; base_amount and percentage only document it.`,
      });
    }
  }

  return errors;
}
