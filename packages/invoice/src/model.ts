/** Canonical net / total computation over the simplified-invoice model.
 *
 *  Pure arithmetic — no HTML, no i18n, no code-list lookups. These are the
 *  numbers an editor needs while a draft is being written (per-line net, the
 *  VAT breakdown, and the document totals chain down to the payable amount),
 *  and `completeInvoice` turns a draft into the invoice it will be once issued.
 *  The renderer computes nothing: it shows what it is given.
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
  vat_accounting_currency_code?: string;
  tax_amount_accounting_currency?: Decimal;
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
  /** In first-seen order over lines, then document allowances, then document
   *  charges: the order the XML writers emit BG-23 in. */
  taxSubtotals: TaxSubtotal[];
}

/** BG-22 as the simplified JSON states it (`totals`). Optional keys are the
 *  ones the XML writers only emit when non-zero. */
export interface DocumentTotals {
  line_net_total: number;
  allowance_total?: number;
  charge_total?: number;
  tax_exclusive_amount: number;
  tax_amount: number;
  tax_amount_accounting_currency?: number;
  tax_inclusive_amount: number;
  prepaid_amount?: number;
  rounding_amount?: number;
  amount_due: number;
}

/** One BG-23 entry as the simplified JSON states it (`vat_breakdown[]`). */
export interface VatBreakdownEntry {
  category_code?: string;
  rate: number;
  taxable_amount: number;
  tax_amount: number;
  reason?: string;
  reason_code?: string;
}

/** What `completeInvoice` adds to a draft. */
export interface Completion {
  lines: { net_amount: number }[];
  vat_breakdown: VatBreakdownEntry[];
  totals: DocumentTotals;
}

/** Round to two decimals, half away from zero — commercial rounding.
 *
 *  EN 16931 §6.5.2 fixes every `Amount` (BT-131, BT-106…BT-117, …) at exactly
 *  two decimals. Only `UnitPriceAmount` (BT-146), `Quantity` (BT-129) and
 *  `Percentage` (BT-119) carry unlimited precision — which is precisely why the
 *  boundary matters: the moment those combine into an Amount, the result is
 *  fixed at 2dp. Every value this module returns is an Amount, so every one of
 *  them passes through here.
 *
 *  The `toPrecision(15)` hop strips binary representation noise *before* the
 *  rounding decision: 1.005 is stored as 1.0049999999999998934, so a plain
 *  `Math.round(1.005 * 100)` yields 100 → 1.00 where commercial rounding
 *  requires 1.01. Fifteen significant digits sits below a double's ~17 and
 *  above any invoice amount we can faithfully represent, so it erases the
 *  error without disturbing the value.
 *
 *  Negatives are mirrored because `Math.round` breaks ties toward +∞
 *  (`Math.round(-0.5)` is `-0`, not `-1`). Credit notes and allowances must
 *  round away from zero like everything else. The `=== 0` guard keeps a
 *  negative zero from escaping. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const scaled = Number((n * 100).toPrecision(15));
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded === 0 ? 0 : rounded / 100;
}

/** Net amount of a single line (BT-131): explicit `net_amount` wins, else
 *  quantity × price ÷ base_quantity, then line allowances/charges applied.
 *
 *  Rounded once at the end, not per term: EN 16931 defines BT-131 as
 *  ((BT-129 ÷ BT-149) × BT-146) − Σ BT-136 + Σ BT-141, and it is the *result*
 *  that is an Amount. The inputs are unlimited-precision by design — 3 × €0.333
 *  is €1.00, not €0.999. */
export function lineNet(line: MoneyLine): number {
  if (line.net_amount != null) return round2(Number(line.net_amount));
  const qty = Number(line.quantity ?? 0);
  const price = Number(line.price?.net_price ?? 0);
  const baseQty = Number(line.price?.base_quantity ?? 1) || 1;
  let net = (qty * price) / baseQty;
  for (const a of line.allowances || []) net -= Number(a.amount || 0);
  for (const c of line.charges || []) net += Number(c.amount || 0);
  return round2(net);
}

// Same key as the XML writers' `tax_group_key`: the rate as a number, so "19",
// "19.00" and 19 are one group.
const groupKey = (category: string | undefined, rate: Decimal | undefined): string =>
  `${category ?? ""}|${Number(rate ?? 0)}`;

// Group line-level taxable amounts (plus document-level allowances/charges)
// by (category_code, rate) and attach exemption reasons from vat_breakdown.
function vatBreakdown(invoice: ComputableInvoice): TaxSubtotal[] {
  const groups = new Map<string, TaxSubtotal>();
  const add = (amount: Decimal, category: string | undefined, rate: Decimal | undefined): void => {
    const key = groupKey(category, rate);
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
    // BT-116 first, then BT-117 *from the rounded base* — EN 16931 defines
    // BT-117 = BT-116 × (BT-119 ÷ 100), and BT-116 is itself an Amount, so the
    // tax is computed on the 2dp taxable base rather than on a running float.
    g.taxable = round2(g.taxable);
    g.tax = round2((g.taxable * (g.rate || 0)) / 100);
  }

  // BT-120/121 exemption reasons live in vat_breakdown[], keyed on
  // (category_code, rate). Attach them to the matching subtotal.
  for (const e of invoice.vat_breakdown || []) {
    const g = groups.get(groupKey(e.category_code, e.rate));
    if (g) {
      g.reason = e.reason;
      g.reason_code = e.reason_code;
    }
  }

  // Map order: first seen. Deliberately not sorted, so a preview lists the
  // groups in the order the issued document will.
  return [...groups.values()];
}

/** Full totals chain for an invoice: line extension → tax basis (after
 *  document allowances/charges) → VAT → grand total → payable (after prepaid
 *  and rounding). */
export function computeTotals(invoice: ComputableInvoice): InvoiceTotals {
  // Every name below is an EN 16931 Amount, so every one is rounded as it is
  // produced rather than once at the end. That ordering is the standard's, not
  // a preference: each BT is defined in terms of the *rounded* BTs above it,
  // and rounding only at the end lets sub-cent residue reach the payable —
  // which is how a €0.45 line at 19% with €0.54 prepaid rendered "-0.00 EUR"
  // (0.45 + 0.0855 − 0.54 = −0.0045) on a customer's correction invoice.
  const lines = invoice.lines || [];
  let lineExt = 0;
  for (const l of lines) lineExt += lineNet(l); // each already 2dp
  lineExt = round2(lineExt); // BT-106

  const documentAllowances = round2(
    (invoice.document_allowances || []).reduce((s, a) => s + Number(a.amount || 0), 0),
  ); // BT-107
  const documentCharges = round2(
    (invoice.document_charges || []).reduce((s, c) => s + Number(c.amount || 0), 0),
  ); // BT-108

  const taxBasis = round2(lineExt - documentAllowances + documentCharges); // BT-109
  const taxSubtotals = vatBreakdown(invoice);
  const taxAmount = round2(taxSubtotals.reduce((s, g) => s + g.tax, 0)); // BT-110
  const grandTotal = round2(taxBasis + taxAmount); // BT-112
  const prepaid = round2(Number(invoice.prepaid_amount || 0)); // BT-113
  const rounding = round2(Number(invoice.rounding_amount || 0)); // BT-114
  const payable = round2(grandTotal - prepaid + rounding); // BT-115

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

const defined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** The invoice a draft becomes once issued: every derived value filled in, as
 *  the transformation layer writes it into the XML and as extraction reads it
 *  back. Adds `lines[].net_amount` (a stated one is kept), the full
 *  `vat_breakdown` with amounts (input entries only contribute exemption
 *  reasons; first-seen order) and `totals` (any input `totals` is replaced,
 *  just as the server ignores it). Returns a new object; the draft is not
 *  modified.
 *
 *  This is where derived values come from. Renderers show what they are given,
 *  so a draft goes through here first. */
export function completeInvoice<T extends ComputableInvoice>(draft: T): T & Completion {
  const t = computeTotals(draft);
  const lines = (draft.lines || []).map((l) => ({ ...l, net_amount: lineNet(l) }));
  const vat_breakdown = t.taxSubtotals.map((g) =>
    defined({
      category_code: g.category,
      rate: g.rate,
      taxable_amount: g.taxable,
      tax_amount: g.tax,
      reason: g.reason || undefined,
      reason_code: g.reason_code || undefined,
    }),
  );
  // The XML writers emit BT-107/108 only when positive and BT-113/114 only
  // when non-zero; extraction then has nothing to read. Mirror that. A
  // negative prepaid amount is valid (an already-settled negative invoice
  // states one equal to its gross total) and is stated like any other.
  const acct = draft.vat_accounting_currency_code && draft.tax_amount_accounting_currency != null
    ? round2(Number(draft.tax_amount_accounting_currency))
    : undefined;
  const totals: DocumentTotals = defined({
    line_net_total: t.lineExtension,
    allowance_total: t.documentAllowances > 0 ? t.documentAllowances : undefined,
    charge_total: t.documentCharges > 0 ? t.documentCharges : undefined,
    tax_exclusive_amount: t.taxBasis,
    tax_amount: t.taxAmount,
    tax_amount_accounting_currency: acct,
    tax_inclusive_amount: t.grandTotal,
    prepaid_amount: t.prepaid !== 0 ? t.prepaid : undefined,
    rounding_amount: t.rounding !== 0 ? t.rounding : undefined,
    amount_due: t.payable,
  });
  return { ...draft, lines, vat_breakdown, totals } as T & Completion;
}
