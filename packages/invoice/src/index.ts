/** @facturion/invoice — the simplified-JSON invoice data model.
 *
 *  The EN 16931 simplified-invoice JSON Schema (the canonical, language-neutral
 *  contract), strict + partial validators over it, the derived TypeScript
 *  types, and the canonical net/total computation helpers. The renderer package
 *  (and any creator/importer/draft surface) builds on this; it owns no
 *  presentation. */

export { invoiceSchema } from "../generated/schema.js";

// `Invoice` is the EN 16931 document (a parsed invoice, a completed draft),
// `InvoiceInput` what the schema accepts; see src/generate.ts.
export type { Invoice, InvoiceInput } from "../generated/invoice-types.js";
/** @deprecated The input type, now `InvoiceInput`. */
export type { InvoiceInput as EN16931SimplifiedInvoice } from "../generated/invoice-types.js";

export {
  validateInvoice,
  validatePartialInvoice,
  assertValidInvoice,
  assertPartialInvoice,
  InvoiceValidationError,
} from "./validate.js";
export type { PartialInvoice } from "./validate.js";

// Exported standalone as well as wired into strict validation: a draft surface
// that cannot use the strict validator (half its required fields are still
// empty) may still want to flag a self-contradicting allowance as soon as both
// derivation fields are present.
export { checkAdjustmentDerivations } from "./adjustments.js";

// `round2` is exported deliberately: any consumer that computes an Amount of
// its own needs the same rounding these totals were built with, or its figures
// drift from ours. EN 16931 Amounts are 2dp everywhere, not just in here.
export { lineNet, computeTotals, completeInvoice, round2 } from "./model.js";
export type {
  ComputableInvoice,
  InvoiceTotals,
  TaxSubtotal,
  DocumentTotals,
  VatBreakdownEntry,
  Completion,
} from "./model.js";

export { field, fieldIn, setField, setFieldIn, addEntry, addEntryIn, READ_FIELDS, WRITE_FIELDS } from "./fields.js";
export type {
  FieldTypes,
  InputFieldTypes,
  FieldCode,
  SettableCode,
  SingleCode,
  ManyCode,
  GroupedCode,
  SettableSingleCode,
  SettableGroupedCode,
  ListCode,
  GroupedListCode,
  Located,
} from "./fields.js";
