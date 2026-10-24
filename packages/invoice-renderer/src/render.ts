// Render a "normal invoice" HTML fragment — the way a buyer, seller or
// auditor would expect a commercial document to look. Input: the simplified
// EN 16931 JSON modelled by @facturion/invoice.
//
// Sections are conditional: blocks with no data render nothing, so a bare
// invoice stays compact while a fully-specified one surfaces every field a
// traditional invoice document would carry.
//
// `t(key, vars?)` is injected — a label resolver for `view.*` document strings
// and the `units.*` / `paymentMeans.*` / `invoiceTypes.*` / `vatCategory.*` /
// `taxPointDateCode.*` vocabularies. `renderInvoiceDocument` supplies a default
// `t` (bundled strings + @facturion/codelists); advanced callers pass their
// own.
//
// The renderer computes nothing. Line net amounts, the VAT breakdown and the
// document totals are shown as the invoice states them; an absent one is not
// made up. An extracted invoice states them (right or wrong — showing what the
// document says is the point); a draft gets them from `completeInvoice` in
// @facturion/invoice before it is rendered.
import type { PartialInvoice } from "@facturion/invoice";
import { DEFAULT_LANG, viewLabel, type Lang, type LabelKey, type TFunction } from "./i18n.js";

/** An invoice that states its totals: extracted from XML, or a draft passed
 *  through `completeInvoice` from @facturion/invoice. The renderer shows the
 *  stated line nets, VAT breakdown and totals and computes none of them; other
 *  fields may still be missing (absent fields are simply not rendered). */
export type RenderableInvoice = PartialInvoice & { totals: NonNullable<PartialInvoice["totals"]> };

type Line = NonNullable<RenderableInvoice["lines"]>[number];
type DocumentAllowance = NonNullable<RenderableInvoice["document_allowances"]>[number];
type DocumentCharge = NonNullable<RenderableInvoice["document_charges"]>[number];
type LineAllowance = NonNullable<Line["allowances"]>[number];
type LineCharge = NonNullable<Line["charges"]>[number];

/** An identifier with an optional scheme (BT-29, BT-46, BT-34, …). */
interface SchemeId {
  id?: string;
  scheme_id?: string;
}

interface AddressLike {
  line1?: string;
  line2?: string;
  line3?: string;
  post_code?: string;
  city?: string;
  country_subdivision?: string;
  country_code?: string;
}

/** What a party block shows; the seller, buyer, payee, tax representative and
 *  deliver-to party each have a subset of it. */
interface PartyLike {
  name?: string;
  trading_name?: string;
  address?: AddressLike;
  identifiers?: readonly (SchemeId | undefined)[];
  identifier?: SchemeId;
  vat_id?: string;
  tax_registration_id?: string;
  legal_registration_id?: SchemeId;
  electronic_address?: SchemeId;
  additional_legal_info?: string;
  contact?: { name?: string; phone?: string; email?: string };
}

type Adjustment = DocumentAllowance | DocumentCharge | LineAllowance | LineCharge;
type Payment = NonNullable<RenderableInvoice["payment"]>;

/** One row of the totals block. `bt` lists the fields it shows (a merged row
 *  shows several); `value: null` is a full-width note row. */
interface TotalsRow {
  label: string;
  value: string | null;
  bt: string[];
  cls: string;
}

// null and undefined both mean "not stated": amt() shows a dash for it, where
// Number(null) would read as a zero.
const stated = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

// Shared formatting helpers. All of them format deterministically from the
// document language — never from the process locale, so the same invoice
// renders byte-identically on any host (Lambda ICU builds differ).
/** HTML-escape a value (`&`, `<`, `>`, `"`). */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const _SEPARATORS: Readonly<Record<Lang, { group: string; decimal: string }>> = {
  en: { group: ",", decimal: "." },
  de: { group: ".", decimal: "," },
};

function _formatNumber(n: number, lang: Lang, minFraction?: number): string {
  // Typed callers pass a Lang; a JS caller's unknown language gets the default.
  const sep = _SEPARATORS[lang] ?? _SEPARATORS[DEFAULT_LANG];
  const abs = Math.abs(n);
  const [whole = "", fracPart] = (minFraction != null ? abs.toFixed(minFraction) : String(abs)).split(".");
  const intPart = whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep.group);
  const frac = fracPart ? sep.decimal + fracPart : "";
  // U+2212 minus sign, matching the sign glyph used elsewhere on the document.
  return `${n < 0 ? "−" : ""}${intPart}${frac}`;
}

/** Two-decimal amount in the document language (EN 16931 Amounts are 2dp);
 *  non-numerics pass through escaped, an absent value as a dash. */
export function amt(value: unknown, lang: Lang = DEFAULT_LANG): string {
  const n = Number(value);
  if (!isFinite(n)) return esc(value ?? "—");
  return _formatNumber(n, lang, 2);
}

/** `amt(value)` suffixed with a currency code when there is one. */
export function curAmt(value: unknown, cur?: string, lang: Lang = DEFAULT_LANG): string {
  // U+00A0 (no-break space) keeps the amount and its currency on one line.
  return cur ? `${amt(value, lang)}\u00a0${esc(cur)}` : amt(value, lang);
}

/** Quantities, rates, percentages: unlimited precision, localized separators. */
export function num(value: unknown, lang: Lang = DEFAULT_LANG): string {
  const n = Number(value);
  if (!isFinite(n)) return esc(value ?? "");
  return _formatNumber(n, lang);
}

/** ISO dates localize for German (17.07.2026); other languages keep the
 *  unambiguous ISO form. Non-ISO input passes through untouched. */
export function fmtDate(value: unknown, lang: Lang = DEFAULT_LANG): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return esc(value ?? "");
  if (lang === "de") return `${m[3]}.${m[2]}.${m[1]}`;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unitLabel(code: string | undefined, qty: unknown, t: TFunction): string {
  if (!code) return "";
  const plural = Number(qty) !== 1;
  const key: LabelKey = `units.${code}${plural ? "_plural" : ""}`;
  const label = t(key);
  return label === key ? code : label;
}

function dateRange(start: string | undefined, end: string | undefined, lang: Lang): string {
  if (start && end && start !== end) return `${fmtDate(start, lang)} – ${fmtDate(end, lang)}`;
  return fmtDate(start || end || "", lang);
}

/** Scheme-qualified identifier display: `id (scheme_id)`. */
function schemeVal(obj: SchemeId | undefined): string {
  if (!obj?.id) return "";
  return obj.scheme_id ? `${obj.id} (${obj.scheme_id})` : obj.id;
}

function addressLines(addr: AddressLike | undefined): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  if (addr.line1) lines.push(addr.line1);
  if (addr.line2) lines.push(addr.line2);
  if (addr.line3) lines.push(addr.line3);
  const pcCity = [addr.post_code, addr.city].filter(Boolean).join(" ");
  if (pcCity) lines.push(pcCity);
  if (addr.country_subdivision) lines.push(addr.country_subdivision);
  if (addr.country_code) lines.push(addr.country_code);
  return lines;
}

/** Codelist label with the raw code as fallback: a custom `t` that misses
 *  returns the KEY unchanged ("vatCategory.AE"), which must never reach the
 *  document — degrade to the code itself, like every other codelist lookup. */
function codeLabel(t: TFunction, prefix: "vatCategory" | "taxPointDateCode", code: string | undefined): string {
  if (!code) return "";
  const key: LabelKey = `${prefix}.${code}`;
  const label = t(key);
  return label && label !== key ? label : code;
}

/** Reason display for allowances/charges: text, code, or the generic label,
 *  plus the percentage/base derivation when the document carries it. */
function acReason(x: Adjustment, fallback: string, t: TFunction, lang: Lang): string {
  let label = x.reason || x.reason_code || fallback;
  if (x.reason && x.reason_code) label = `${x.reason} (${x.reason_code})`;
  const bits: string[] = [];
  if (x.percentage != null) bits.push(`${num(x.percentage, lang)} %`);
  if (x.base_amount != null) bits.push(`${viewLabel(t, "of")} ${amt(x.base_amount, lang)}`);
  return bits.length ? `${label} (${bits.join(" ")})` : label;
}

// ── Section builders ──────────────────────────────────────────────────────

/** BT-3 → document title. 380 and unknown codes keep the friendly "Invoice";
 *  381 keeps the established "Credit Note"; every other UNCL 1001 code takes
 *  its codelist label (e.g. 384 → "Corrected invoice"/"Rechnungskorrektur"). */
function docTitle(invoice: RenderableInvoice, t: TFunction): string {
  const code = invoice.invoice_type_code;
  if (!code || code === "380") return viewLabel(t, "invoice");
  if (code === "381") return viewLabel(t, "creditNote");
  const key: LabelKey = `invoiceTypes.${code}`;
  const label = t(key);
  return label && label !== key && label !== code ? label : viewLabel(t, "invoice");
}

function headerBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang): string {
  // BG-3 sits under the document number: on a corrective document the link to
  // the preceding invoice is part of its identity, not a footnote reference.
  const preceding = (invoice.preceding_invoices || [])
    .map(p => (p.issue_date ? `${p.reference} (${fmtDate(p.issue_date, lang)})` : p.reference))
    .join(", ");

  const rows: string[] = [];
  rows.push(`<div><span class="inv-label">${viewLabel(t, "issueDate")}</span> ${fmtDate(invoice.issue_date, lang)}</div>`);
  if (invoice.due_date) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "dueDate")}</span> ${fmtDate(invoice.due_date, lang)}</div>`);
  }
  // BT-7 / BT-8 are mutually exclusive per the model; render whichever exists.
  if (invoice.tax_point_date) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "taxPointDate")}</span> ${fmtDate(invoice.tax_point_date, lang)}</div>`);
  } else if (invoice.tax_point_date_code) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "taxPointDate")}</span> ${esc(codeLabel(t, "taxPointDateCode", invoice.tax_point_date_code))}</div>`);
  }
  if (invoice.currency_code) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "currency")}</span> ${esc(invoice.currency_code)}</div>`);
  }
  if (invoice.vat_accounting_currency_code) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "vatCurrency")}</span> ${esc(invoice.vat_accounting_currency_code)}</div>`);
  }

  return `
    <div class="inv-header">
      <div class="inv-header-left">
        <div class="inv-type">${esc(docTitle(invoice, t))}</div>
        <div class="inv-id">${esc(invoice.invoice_number)}</div>
        ${preceding ? `<div class="inv-preceding"><span class="inv-label">${viewLabel(t, "preceding")}</span> ${esc(preceding)}</div>` : ""}
      </div>
      <div class="inv-header-right">
        ${rows.join("\n        ")}
      </div>
    </div>`;
}

function partyBlock(party: PartyLike | undefined, label: string, t: TFunction, extraLines: readonly string[] = []): string {
  if (!party) return "";
  const rows: string[] = [];
  if (party.name) {
    rows.push(`<div class="inv-party-name">${esc(party.name)}</div>`);
  }
  if (party.trading_name && party.trading_name !== party.name) {
    rows.push(`<div class="inv-party-trading">${esc(party.trading_name)}</div>`);
  }
  for (const l of addressLines(party.address)) {
    rows.push(`<div>${esc(l)}</div>`);
  }
  // BT-29 (seller: array) / BT-46, BT-60 (buyer, payee: single object).
  for (const ident of party.identifiers || []) {
    if (ident?.id) rows.push(`<div><span class="inv-label">${viewLabel(t, "identifier")}</span> ${esc(schemeVal(ident))}</div>`);
  }
  if (party.identifier?.id) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "identifier")}</span> ${esc(schemeVal(party.identifier))}</div>`);
  }
  if (party.vat_id) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "vatId")}</span> ${esc(party.vat_id)}</div>`);
  }
  if (party.tax_registration_id) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "taxRegId")}</span> ${esc(party.tax_registration_id)}</div>`);
  }
  if (party.legal_registration_id?.id) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "regId")}</span> ${esc(schemeVal(party.legal_registration_id))}</div>`);
  }
  // BT-34 / BT-49 electronic address (id + CEF/EAS scheme).
  if (party.electronic_address?.id) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "eAddress")}</span> ${esc(schemeVal(party.electronic_address))}</div>`);
  }
  if (party.additional_legal_info) {
    rows.push(`<div class="inv-party-legal">${esc(party.additional_legal_info)}</div>`);
  }
  if (party.contact) {
    const bits = [party.contact.name, party.contact.phone, party.contact.email].filter(Boolean);
    if (bits.length) {
      rows.push(`<div class="inv-party-contact">${bits.map(esc).join(" · ")}</div>`);
    }
  }
  for (const extra of extraLines) rows.push(extra);

  return `<div class="inv-party"><div class="inv-party-label">${esc(label)}</div>${rows.join("")}</div>`;
}

function partiesBlock(invoice: RenderableInvoice, t: TFunction): string {
  const buyerExtras = invoice.buyer_reference
    ? [`<div><span class="inv-label">Ref</span> ${esc(invoice.buyer_reference)}</div>`]
    : [];

  const primary = `
    <div class="inv-parties">
      ${partyBlock(invoice.seller, viewLabel(t, "from"), t)}
      ${partyBlock(invoice.buyer,  viewLabel(t, "to"),  t, buyerExtras)}
    </div>`;

  // Secondary parties only appear when present (payee, tax rep, deliver-to).
  const secondaries: string[] = [];

  if (invoice.payee) {
    secondaries.push(partyBlock(invoice.payee, viewLabel(t, "payee"), t));
  }
  if (invoice.seller_tax_representative) {
    secondaries.push(partyBlock(invoice.seller_tax_representative, viewLabel(t, "taxRep"), t));
  }
  const d = invoice.delivery;
  if (d && (d.name || d.address?.line1 || d.location_id?.id)) {
    const extras: string[] = [];
    if (d.location_id?.id) {
      extras.push(`<div><span class="inv-label">${viewLabel(t, "identifier")}</span> ${esc(schemeVal(d.location_id))}</div>`);
    }
    secondaries.push(partyBlock(
      { name: d.name, address: d.address },
      viewLabel(t, "deliverTo"),
      t,
      extras,
    ));
  }

  const secondaryHtml = secondaries.length
    ? `<div class="inv-parties-secondary">${secondaries.join("")}</div>`
    : "";

  return primary + secondaryHtml;
}

function referencesBlock(invoice: RenderableInvoice, t: TFunction): string {
  const refs: [label: string, value: string][] = [];
  const push = (label: string, value: string | undefined) => { if (value) refs.push([label, value]); };

  push(viewLabel(t, "purchaseOrder"),    invoice.purchase_order_reference);
  push(viewLabel(t, "contract"),         invoice.contract_reference);
  push(viewLabel(t, "project"),          invoice.project_reference);
  push(viewLabel(t, "salesOrder"),       invoice.sales_order_reference);
  push(viewLabel(t, "despatchAdvice"),   invoice.despatch_advice_reference);
  push(viewLabel(t, "receivingAdvice"),  invoice.receiving_advice_reference);
  push(viewLabel(t, "tender"),           invoice.tender_or_lot_reference);
  push(viewLabel(t, "objectIdentifier"), schemeVal(invoice.object_identifier));
  push(viewLabel(t, "accountingRef"),    invoice.buyer_accounting_reference);

  if (refs.length === 0) return "";
  const rows = refs.map(([k, v]) =>
    `<div class="inv-ref"><span class="inv-ref-label">${esc(k)}</span><span class="inv-ref-value">${esc(v)}</span></div>`
  ).join("");
  return `<div class="inv-references">${rows}</div>`;
}

function periodBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang): string {
  // BT-72 and BG-14 are independent in EN 16931 (BR-IC-11 accepts either or
  // both) — render both when both exist.
  const rows: string[] = [];
  const period = invoice.delivery?.period;
  if (period?.start_date || period?.end_date) {
    rows.push(`<div class="inv-period">
      <span class="inv-label">${viewLabel(t, "invoicingPeriod")}</span>
      ${dateRange(period.start_date, period.end_date, lang)}
    </div>`);
  }
  if (invoice.delivery?.date) {
    rows.push(`<div class="inv-period">
      <span class="inv-label">${viewLabel(t, "deliveryDate")}</span>
      ${fmtDate(invoice.delivery.date, lang)}
    </div>`);
  }
  return rows.join("");
}

function notesBlock(invoice: RenderableInvoice, t: TFunction): string {
  const notes = invoice.notes || [];
  if (notes.length === 0) return "";
  const items = notes.map(n => {
    const code = n.subject_code ? `<span class="inv-note-code">${esc(n.subject_code)}</span> ` : "";
    return `<p>${code}${esc(n.text)}</p>`;
  }).join("");
  return `<div class="inv-notes">
    <div class="inv-section-label">${esc(viewLabel(t, "notes"))}</div>
    ${items}
  </div>`;
}

function linesBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang): string {
  const lines = invoice.lines || [];
  const rows = lines.map(line => {
    const qty       = line.quantity;
    const unit      = line.unit_code;
    const netPrice  = line.price?.net_price;
    const grossPrice = line.price?.gross_price;
    const discount  = line.price?.discount;
    const taxRate   = line.vat?.rate;
    const taxCat    = line.vat?.category_code;
    const total     = stated(line.net_amount);
    const item: NonNullable<Line["item"]> = line.item ?? {};
    const name      = item.name || "";
    const desc      = item.description && item.description !== name
      ? item.description : "";

    const meta: string[] = [];
    const pushMeta = (label: string, value: string | undefined) => {
      if (value) meta.push(`<div class="inv-line-meta"><span class="inv-label">${label}</span> ${esc(value)}</div>`);
    };
    if (line.period?.start_date || line.period?.end_date) {
      meta.push(`<div class="inv-line-meta"><span class="inv-label">${viewLabel(t, "linePeriod")}</span> ${dateRange(line.period.start_date, line.period.end_date, lang)}</div>`);
    }
    if (line.note) meta.push(`<div class="inv-line-meta">${esc(line.note)}</div>`);
    pushMeta(viewLabel(t, "itemSellerId"),   item.seller_id);
    pushMeta(viewLabel(t, "itemBuyerId"),    item.buyer_id);
    pushMeta(viewLabel(t, "itemStandardId"), schemeVal(item.standard_id));
    for (const c of item.classifications || []) {
      const scheme = [c.scheme_id, c.version].filter(Boolean).join(" ");
      pushMeta(viewLabel(t, "classification"), scheme ? `${c.id} (${scheme})` : c.id);
    }
    pushMeta(viewLabel(t, "origin"), item.country_of_origin);
    for (const a of item.attributes || []) {
      if (a?.name) pushMeta(esc(a.name), a.value);
    }
    pushMeta(viewLabel(t, "orderLine"),        line.order_line_reference);
    pushMeta(viewLabel(t, "objectIdentifier"), schemeVal(line.object_identifier));
    pushMeta(viewLabel(t, "accountingRef"),    line.buyer_accounting_reference);

    // Line-level allowances and charges: shown inline under the description,
    // with their percentage/base derivation and reason (code) when present.
    for (const a of line.allowances || []) {
      meta.push(`<div class="inv-line-allowance">− ${amt(a.amount, lang)} · ${esc(acReason(a, viewLabel(t, "documentAllowance"), t, lang))}</div>`);
    }
    for (const c of line.charges || []) {
      meta.push(`<div class="inv-line-charge">+ ${amt(c.amount, lang)} · ${esc(acReason(c, viewLabel(t, "documentCharge"), t, lang))}</div>`);
    }

    // Show gross + discount alongside the net price when the invoice carries
    // both (e.g. "100.00" over "was 120.00 (− 20.00)").
    let priceCell = amt(netPrice, lang);
    if (grossPrice != null && (discount != null || Number(grossPrice) !== Number(netPrice))) {
      const was = viewLabel(t, "priceBefore", { price: amt(grossPrice, lang) });
      const disc = discount != null ? ` (− ${amt(discount, lang)})` : "";
      priceCell += `<div class="inv-line-price-gross">${esc(was + disc)}</div>`;
    }
    // BT-149/150: a price expressed per N units, not per 1.
    const baseQty = line.price?.base_quantity;
    if (baseQty != null && Number(baseQty) !== 1) {
      const baseUnit = line.price?.base_quantity_unit_code;
      const qtyText = baseUnit
        ? `${num(baseQty, lang)} ${unitLabel(baseUnit, baseQty, t)}`
        : num(baseQty, lang);
      priceCell += `<div class="inv-line-price-base">${esc(viewLabel(t, "perBase", { qty: qtyText }))}</div>`;
    }

    // BT-151/152: the rate, plus the category letter whenever it isn't the
    // standard rate — Z/E/AE/K/G/O lines must be visibly not-just-0%.
    let vatCell = "";
    if (taxRate != null) vatCell = `${num(taxRate, lang)} %`;
    if (taxCat && taxCat !== "S") {
      vatCell += `${vatCell ? " " : ""}<span class="inv-line-vatcat">${esc(taxCat)}</span>`;
    }

    return `
    <tr>
      <td class="inv-col-id">${esc(line.id)}</td>
      <td class="inv-col-desc">
        <div class="inv-line-name">${esc(name)}</div>
        ${desc ? `<div class="inv-line-desc">${esc(desc)}</div>` : ""}
        ${meta.join("")}
      </td>
      <td class="inv-col-num">${num(qty, lang)}${unit ? ` ${esc(unitLabel(unit, qty, t))}` : ""}</td>
      <td class="inv-col-num">${priceCell}</td>
      <td class="inv-col-num">${vatCell}</td>
      <td class="inv-col-num">${amt(total, lang)}</td>
    </tr>`;
  }).join("");

  return `
    <div class="inv-lines-wrap">
      <table class="data-table inv-lines">
        <thead><tr>
          <th class="inv-col-id">${viewLabel(t, "lineNo")}</th>
          <th class="inv-col-desc">${viewLabel(t, "description")}</th>
          <th class="inv-col-num">${viewLabel(t, "quantity")}</th>
          <th class="inv-col-num">${viewLabel(t, "unitPrice")}</th>
          <th class="inv-col-num">${viewLabel(t, "taxRate")}</th>
          <th class="inv-col-num">${viewLabel(t, "lineTotal")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// BG-22 document totals: every total the invoice states, in the EN 16931
// order: line sum, document allowances and charges, net total, VAT per
// category, VAT total, gross total, prepaid, rounding, amount due. Nothing is
// computed; an absent total has no row.
//
// A total collapses into the row above it when that row is its only addend
// and both state the same amount: one VAT category whose tax equals the VAT
// total, nothing between the line sum and the net total, no prepaid or
// rounding between the gross total and the amount due. Two amounts that
// disagree never merge, so an inconsistent invoice shows the inconsistency.
//
// `bt` lists the fields each row shows (a merged row shows several).
function totalsBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang): string {
  const cur = invoice.currency_code;
  const tot = invoice.totals || {};
  const money = (v: unknown) => curAmt(v, cur, lang);
  const signed = (sign: "+" | "−", v: unknown) => `${sign} ${money(v)}`;
  const same = (a: unknown, b: unknown) => a != null && b != null && Number(a) === Number(b);
  const has = <T>(v: T | null | undefined): v is T => v != null;
  const rows: TotalsRow[] = [];
  const row = (label: string, value: string, bt: string | readonly (string | false)[], cls = ""): TotalsRow => {
    const r: TotalsRow = { label, value, bt: [bt].flat().filter((b): b is string => Boolean(b)), cls };
    rows.push(r);
    return r;
  };

  const allowances = invoice.document_allowances || [];
  const charges = invoice.document_charges || [];

  // BT-106 → BT-109
  if (!allowances.length && !charges.length
      && (!has(tot.line_net_total) || !has(tot.tax_exclusive_amount) || same(tot.line_net_total, tot.tax_exclusive_amount))) {
    const v = tot.tax_exclusive_amount ?? tot.line_net_total;
    if (has(v)) {
      row(viewLabel(t, "netTotal"), money(v), [has(tot.line_net_total) && "BT-106", has(tot.tax_exclusive_amount) && "BT-109"], "inv-totals-sum");
    }
  } else {
    if (has(tot.line_net_total)) row(viewLabel(t, "subtotal"), money(tot.line_net_total), "BT-106");
    for (const a of allowances) {
      row(esc(acReason(a, viewLabel(t, "documentAllowance"), t, lang)), signed("−", a.amount), "BG-20");
    }
    if (has(tot.allowance_total) && !(allowances.length === 1 && same(allowances[0]?.amount, tot.allowance_total))) {
      row(viewLabel(t, "allowanceTotal"), signed("−", tot.allowance_total), "BT-107");
    } else if (has(tot.allowance_total)) rows.at(-1)?.bt.push("BT-107"); // the one allowance's row
    for (const c of charges) {
      row(esc(acReason(c, viewLabel(t, "documentCharge"), t, lang)), signed("+", c.amount), "BG-21");
    }
    if (has(tot.charge_total) && !(charges.length === 1 && same(charges[0]?.amount, tot.charge_total))) {
      row(viewLabel(t, "chargeTotal"), signed("+", tot.charge_total), "BT-108");
    } else if (has(tot.charge_total)) rows.at(-1)?.bt.push("BT-108"); // the one charge's row
    if (has(tot.tax_exclusive_amount)) row(viewLabel(t, "netTotal"), money(tot.tax_exclusive_amount), "BT-109", "inv-totals-sum");
  }

  // BG-23, then BT-110
  const vat = invoice.vat_breakdown || [];
  let lastVat: TotalsRow | null = null;
  for (const g of vat) {
    const rateLabel = viewLabel(t, "taxTotal", { rate: num(g.rate ?? 0, lang) });
    const catLabel = g.category_code && g.category_code !== "S"
      ? ` · ${esc(codeLabel(t, "vatCategory", g.category_code))}`
      : "";
    lastVat = row(`${esc(rateLabel)}${catLabel}<span class="inv-vat-base"> · ${viewLabel(t, "taxableAmount")} ${curAmt(stated(g.taxable_amount), cur, lang)}</span>`,
      curAmt(stated(g.tax_amount), cur, lang), "BG-23", "inv-vat-row");
    if (g.reason || g.reason_code) {
      const reason = g.reason
        ? (g.reason_code ? `${g.reason} (${g.reason_code})` : g.reason)
        : g.reason_code;
      rows.push({ label: esc(reason), value: null, bt: ["BT-120"], cls: "inv-vat-reason" });
    }
  }
  if (has(tot.tax_amount)) {
    if (vat.length === 1 && lastVat && same(vat[0]?.tax_amount, tot.tax_amount)) lastVat.bt.push("BT-110");
    else row(viewLabel(t, "vatTotal"), money(tot.tax_amount), "BT-110", "inv-totals-sum");
  }

  // BT-111: VAT total restated in the accounting currency (BT-6).
  const acctCur = invoice.vat_accounting_currency_code;
  const acctVat = invoice.totals?.tax_amount_accounting_currency
    ?? invoice.tax_amount_accounting_currency;
  if (acctCur && acctVat != null) {
    row(esc(viewLabel(t, "taxTotalIn", { cur: acctCur })), curAmt(acctVat, acctCur, lang), "BT-111", "inv-vat-row");
  }

  // BT-112 → BT-115
  const prepaid = Number(tot.prepaid_amount ?? 0);
  const rounding = Number(tot.rounding_amount ?? 0);
  if (prepaid === 0 && rounding === 0
      && (!has(tot.tax_inclusive_amount) || !has(tot.amount_due) || same(tot.tax_inclusive_amount, tot.amount_due))) {
    const v = tot.amount_due ?? tot.tax_inclusive_amount;
    if (has(v)) row(viewLabel(t, "payable"), money(v), [has(tot.tax_inclusive_amount) && "BT-112", has(tot.amount_due) && "BT-115"], "inv-totals-payable");
  } else {
    if (has(tot.tax_inclusive_amount)) row(viewLabel(t, "grossTotal"), money(tot.tax_inclusive_amount), "BT-112", "inv-totals-sum");
    // Sign-faithful: a positive prepaid is subtracted, a negative one added.
    if (prepaid !== 0) row(viewLabel(t, "prepaid"), signed(prepaid > 0 ? "−" : "+", Math.abs(prepaid)), "BT-113");
    if (rounding !== 0) row(viewLabel(t, "rounding"), signed(rounding > 0 ? "+" : "−", Math.abs(rounding)), "BT-114");
    if (has(tot.amount_due)) row(viewLabel(t, "payable"), money(tot.amount_due), "BT-115", "inv-totals-payable");
  }

  if (rows.length === 0) return "";
  const html = rows.map((r) => {
    const cls = r.cls ? ` class="${r.cls}"` : "";
    if (r.value === null) return `<tr${cls}><td colspan="2">${r.label}</td></tr>`;
    return `<tr${cls}><td>${r.label}</td><td class="inv-col-num">${r.value}</td></tr>`;
  });
  return `<div class="inv-totals-wrap">
    <table class="inv-totals"><tbody>${html.join("")}</tbody></table>
  </div>`;
}

// BG-24: additional supporting documents — reference, description, and where
// the document lives (URL or embedded file).
function supportingDocsBlock(invoice: RenderableInvoice, t: TFunction): string {
  const docs = invoice.supporting_documents || [];
  if (docs.length === 0) return "";
  const rows = docs.map(d => {
    const bits: string[] = [];
    if (d.reference) bits.push(`<span class="inv-doc-ref">${esc(d.reference)}</span>`);
    if (d.description) bits.push(esc(d.description));
    if (d.attached_document?.filename) bits.push(esc(d.attached_document.filename));
    if (d.external_location) bits.push(`<span class="inv-doc-url">${esc(d.external_location)}</span>`);
    return `<div class="inv-doc">${bits.join(" · ")}</div>`;
  }).join("");
  return `<div class="inv-docs">
    <div class="inv-section-label">${esc(viewLabel(t, "attachments"))}</div>
    ${rows}
  </div>`;
}

// Resolve the payment means to a human-readable label. Prefer BT-82 free
// text; fall back to a lookup of the BT-81 (UNTDID 4461) code; fall back
// further to the raw code if the lookup misses.
function paymentMeansLabel(p: Payment, t: TFunction): string {
  if (p.means_text) return p.means_text;
  if (!p.means_code) return "";
  const key: LabelKey = `paymentMeans.${p.means_code}`;
  const label = t(key);
  return label === key ? p.means_code : label;
}

function paymentBlock(invoice: RenderableInvoice, t: TFunction): string {
  const p = invoice.payment;
  if (!p) return "";
  const rows: string[] = [];

  const means = paymentMeansLabel(p, t);
  if (means) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "paymentMeans")}</span> ${esc(means)}</div>`);
  }

  // BG-17 credit transfers (one or more).
  for (const ct of p.credit_transfers || []) {
    if (ct.account_id) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "iban")}</span> ${esc(ct.account_id)}</div>`);
    }
    if (ct.service_provider_id) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "bic")}</span> ${esc(ct.service_provider_id)}</div>`);
    }
    if (ct.account_name) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "accountName")}</span> ${esc(ct.account_name)}</div>`);
    }
  }

  // BG-18 payment card (masked PAN + holder name).
  if (p.card) {
    if (p.card.account_number) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "cardNumber")}</span> ${esc(p.card.account_number)}</div>`);
    }
    if (p.card.holder_name) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "cardHolder")}</span> ${esc(p.card.holder_name)}</div>`);
    }
  }

  // BG-19 direct debit (mandate reference, creditor ID, debited account).
  const dd = p.direct_debit;
  if (dd) {
    if (dd.mandate_reference) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "mandateReference")}</span> ${esc(dd.mandate_reference)}</div>`);
    }
    if (dd.creditor_id) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "creditorId")}</span> ${esc(dd.creditor_id)}</div>`);
    }
    if (dd.debited_account_id) {
      rows.push(`<div><span class="inv-label">${viewLabel(t, "debitedAccount")}</span> ${esc(dd.debited_account_id)}</div>`);
    }
  }

  if (p.remittance_information) {
    rows.push(`<div><span class="inv-label">${viewLabel(t, "remittance")}</span> ${esc(p.remittance_information)}</div>`);
  }

  if (rows.length === 0) return "";
  return `<div class="inv-payment">
    <div class="inv-section-label">${esc(viewLabel(t, "paymentInstructions"))}</div>
    ${rows.join("")}
  </div>`;
}

function paymentTermsBlock(invoice: RenderableInvoice, t: TFunction): string {
  if (!invoice.payment_terms) return "";
  return `<div class="inv-payment-terms">
    <span class="inv-label">${viewLabel(t, "paymentTerms")}</span> ${esc(invoice.payment_terms)}
  </div>`;
}

// ── Entry point ──────────────────────────────────────────────────────────

/**
 * Render the invoice as an HTML fragment (no document chrome). `opts.t` is a
 * label resolver: `(key, vars?) => string`, returning the key unchanged on a
 * miss. `opts.lang` drives date/number formatting (deterministic — the process
 * locale is never consulted). See `renderInvoiceDocument` for a
 * batteries-included wrapper.
 */
export function renderInvoice(invoice: RenderableInvoice, { t, lang = DEFAULT_LANG }: { t: TFunction; lang?: Lang }): string {
  return `
    <div class="invoice-paper">
      ${headerBlock(invoice, t, lang)}
      ${partiesBlock(invoice, t)}
      ${referencesBlock(invoice, t)}
      ${periodBlock(invoice, t, lang)}
      ${notesBlock(invoice, t)}
      ${linesBlock(invoice, t, lang)}
      ${totalsBlock(invoice, t, lang)}
      ${supportingDocsBlock(invoice, t)}
      ${paymentBlock(invoice, t)}
      ${paymentTermsBlock(invoice, t)}
    </div>`;
}
