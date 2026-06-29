/** Canonical net / total computation over the simplified-invoice model.
 *
 *  Pure arithmetic — no HTML, no i18n, no code-list lookups. These are the
 *  numbers a renderer, a previewer or an editor needs (per-line net, the VAT
 *  breakdown, and the document totals chain down to the payable amount). The
 *  presentation layer (formatting, labels) lives in the renderer package; this
 *  is the model.
 *
 *  Input is typed structurally (`ComputableInvoice`) rather than as the full
 *  `Invoice`: the math reads only a subset and must tolerate partial invoices
 *  (a draft or preview may omit otherwise-required fields). Decimal fields
 *  accept a number or a decimal string, matching the schema's `decimal` type. */

type Decimal = number | string;

interface MoneyLine {
  net_amount?: Decimal;
  quantity?: Decimal;
  price?: { net_price?: Decimal; base_quantity?: Decimal };
  allowances?: { amount?: Decimal }[];
  charges?: { amount?: Decimal }[];
  vat?: { category_code?: string; rate?: Decimal };
}

interface DocAdjustment {
  amount?: Decimal;
  vat_category_code?: string;
  vat_rate?: Decimal;
}

export interface ComputableInvoice {
  lines?: MoneyLine[];
  document_allowances?: DocAdjustment[];
  document_charges?: DocAdjustment[];
  vat_breakdown?: { category_code?: string; rate?: Decimal; reason?: string; reason_code?: string }[];
  prepaid_amount?: Decimal;
  rounding_amount?: Decimal;
}

export interface TaxSubtotal {
  category?: string;
  rate: number;
  taxable: number;
  tax: number;
  reason?: string;
  reason_code?: string;
}

export interface InvoiceTotals {
  lineExtension: number;
  documentAllowances: number;
  documentCharges: number;
  taxBasis: number;
  taxAmount: number;
  grandTotal: number;
  prepaid: number;
  rounding: number;
  payable: number;
  /** Sorted by rate descending. */
  taxSubtotals: TaxSubtotal[];
}

/** Net amount of a single line: explicit `net_amount` wins, else
 *  quantity × price ÷ base_quantity, then line allowances/charges applied. */
export function lineNet(line: MoneyLine): number {
  if (line.net_amount != null) return Number(line.net_amount);
  const qty = Number(line.quantity ?? 0);
  const price = Number(line.price?.net_price ?? 0);
  const baseQty = Number(line.price?.base_quantity ?? 1) || 1;
  let net = (qty * price) / baseQty;
  for (const a of line.allowances || []) net -= Number(a.amount || 0);
  for (const c of line.charges || []) net += Number(c.amount || 0);
  return net;
}

// Group line-level taxable amounts (plus document-level allowances/charges)
// by (category_code, rate) and attach exemption reasons from vat_breakdown.
function vatBreakdown(invoice: ComputableInvoice): TaxSubtotal[] {
  const groups = new Map<string, TaxSubtotal>();
  const add = (amount: Decimal, category: string | undefined, rate: Decimal | undefined): void => {
    const key = `${category ?? ""}|${rate ?? 0}`;
    const g = groups.get(key) ?? { category, rate: Number(rate ?? 0), taxable: 0, tax: 0 };
    g.taxable += Number(amount || 0);
    groups.set(key, g);
  };

  for (const line of invoice.lines || []) {
    add(lineNet(line), line.vat?.category_code, line.vat?.rate);
  }
  for (const a of invoice.document_allowances || []) {
    add(-Number(a.amount || 0), a.vat_category_code, a.vat_rate);
  }
  for (const c of invoice.document_charges || []) {
    add(Number(c.amount || 0), c.vat_category_code, c.vat_rate);
  }

  for (const g of groups.values()) {
    g.tax = (g.taxable * (g.rate || 0)) / 100;
  }

  // BT-120/121 exemption reasons live in vat_breakdown[], keyed on
  // (category_code, rate). Attach them to the matching subtotal.
  for (const e of invoice.vat_breakdown || []) {
    const g = groups.get(`${e.category_code ?? ""}|${e.rate ?? 0}`);
    if (g) {
      g.reason = e.reason;
      g.reason_code = e.reason_code;
    }
  }

  return [...groups.values()].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
}

/** Full totals chain for an invoice: line extension → tax basis (after
 *  document allowances/charges) → VAT → grand total → payable (after prepaid
 *  and rounding). */
export function computeTotals(invoice: ComputableInvoice): InvoiceTotals {
  const lines = invoice.lines || [];
  let lineExt = 0;
  for (const l of lines) lineExt += lineNet(l);

  const documentAllowances = (invoice.document_allowances || []).reduce(
    (s, a) => s + Number(a.amount || 0),
    0,
  );
  const documentCharges = (invoice.document_charges || []).reduce(
    (s, c) => s + Number(c.amount || 0),
    0,
  );

  const taxBasis = lineExt - documentAllowances + documentCharges;
  const taxSubtotals = vatBreakdown(invoice);
  const taxAmount = taxSubtotals.reduce((s, g) => s + g.tax, 0);
  const grandTotal = taxBasis + taxAmount;
  const prepaid = Number(invoice.prepaid_amount || 0);
  const rounding = Number(invoice.rounding_amount || 0);
  const payable = grandTotal - prepaid + rounding;

  return {
    lineExtension: lineExt,
    documentAllowances,
    documentCharges,
    taxBasis,
    taxAmount,
    grandTotal,
    prepaid,
    rounding,
    payable,
    taxSubtotals,
  };
}
