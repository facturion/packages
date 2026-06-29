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

export { lineNet, computeTotals } from "./model.js";
export type { ComputableInvoice, InvoiceTotals, TaxSubtotal } from "./model.js";
