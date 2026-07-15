/** @facturion/invoice — the simplified-JSON invoice data model.
 *
 *  The EN 16931 simplified-invoice JSON Schema (the canonical, language-neutral
 *  contract), strict + partial validators over it, the derived TypeScript
 *  types, and the canonical net/total computation helpers. The renderer package
 *  (and any creator/importer/draft surface) builds on this; it owns no
 *  presentation. */

export { invoiceSchema } from "../generated/schema.js";

export type { EN16931SimplifiedInvoice, EN16931SimplifiedInvoice as Invoice } from "../generated/invoice-types.js";

export {
  validateInvoice,
  validatePartialInvoice,
  assertValidInvoice,
  assertPartialInvoice,
  InvoiceValidationError,
} from "./validate.js";

// `round2` is exported deliberately: any consumer that computes an Amount of
// its own needs the same rounding these totals were built with, or its figures
// drift from ours. EN 16931 Amounts are 2dp everywhere, not just in here.
export { lineNet, computeTotals, round2 } from "./model.js";
export type { ComputableInvoice, InvoiceTotals, TaxSubtotal } from "./model.js";
