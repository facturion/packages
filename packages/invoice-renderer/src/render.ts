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
import { DEFAULT_LANG, viewLabel, type Lang, type LabelKey, type PlainViewKey, type TFunction } from "./i18n.js";

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

/** One row of the totals block. `paths` lists the fields it shows (a merged
 *  row shows several); `value: null` is a full-width note row. */
interface TotalsRow {
  label: string;
  value: string | null;
  paths: string[];
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

// ── Annotation ────────────────────────────────────────────────────────────
//
// With `annotate`, every rendered field carries `data-path`: the JSON Pointer
// of the value it shows in the invoice (a whitespace-separated list where one
// element shows several, as a merged totals row does). Where an absent field
// would render, a hidden slot stands in: `<span class="inv-slot"
// data-slot="<pointer>" hidden>` holding the field's label and the word for
// "missing", for a host to reveal. Without `annotate` the markup is exactly
// the plain rendering.

interface Annotator {
  readonly on: boolean;
  /** ` data-path="…"` for an element showing these fields, or nothing. */
  at(...paths: readonly string[]): string;
  /** `html` in a span carrying its path. */
  wrap(path: string, html: string): string;
  /** A hidden placeholder for an absent field, labelled; nothing when off. */
  slot(path: string, label: string, tag?: "span" | "div" | "tr"): string;
}

function annotator(on: boolean, t: TFunction): Annotator {
  if (!on) return { on, at: () => "", wrap: (_p, html) => html, slot: () => "" };
  const missing = viewLabel(t, "missing");
  return {
    on,
    at: (...paths) => ` data-path="${esc(paths.join(" "))}"`,
    wrap: (path, html) => `<span data-path="${esc(path)}">${html}</span>`,
    slot: (path, label, tag = "span") => {
      const body = `<span class="inv-slot-label">${esc(label)}</span> <span class="inv-slot-state">${esc(missing)}</span>`;
      const inner = tag === "tr" ? `<td colspan="2">${body}</td>` : body;
      return `<${tag} class="inv-slot" data-slot="${esc(path)}" hidden>${inner}</${tag}>`;
    },
  };
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

function headerBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang, a: Annotator): string {
  // BG-3 sits under the document number: on a corrective document the link to
  // the preceding invoice is part of its identity, not a footnote reference.
  const preceding = (invoice.preceding_invoices || [])
    .map((p, i) => a.wrap(`/preceding_invoices/${i}`, esc(p.issue_date ? `${p.reference} (${fmtDate(p.issue_date, lang)})` : p.reference)))
    .join(", ");

  const row = (path: string, label: string, html: string) => `<div${a.at(path)}><span class="inv-label">${label}</span> ${html}</div>`;
  const rows: string[] = [];
  rows.push(row("/issue_date", viewLabel(t, "issueDate"), fmtDate(invoice.issue_date, lang)));
  if (invoice.due_date) {
    rows.push(row("/due_date", viewLabel(t, "dueDate"), fmtDate(invoice.due_date, lang)));
  }
  // BT-7 / BT-8 are mutually exclusive per the model; render whichever exists.
  if (invoice.tax_point_date) {
    rows.push(row("/tax_point_date", viewLabel(t, "taxPointDate"), fmtDate(invoice.tax_point_date, lang)));
  } else if (invoice.tax_point_date_code) {
    rows.push(row("/tax_point_date_code", viewLabel(t, "taxPointDate"), esc(codeLabel(t, "taxPointDateCode", invoice.tax_point_date_code))));
  }
  if (invoice.currency_code) {
    rows.push(row("/currency_code", viewLabel(t, "currency"), esc(invoice.currency_code)));
  }
  if (invoice.vat_accounting_currency_code) {
    rows.push(row("/vat_accounting_currency_code", viewLabel(t, "vatCurrency"), esc(invoice.vat_accounting_currency_code)));
  }

  const precedingHtml = preceding
    ? `<div class="inv-preceding"${a.at("/preceding_invoices")}><span class="inv-label">${viewLabel(t, "preceding")}</span> ${preceding}</div>`
    : a.slot("/preceding_invoices", viewLabel(t, "preceding"), "div");

  return `
    <div class="inv-header">
      <div class="inv-header-left">
        <div class="inv-type"${a.at("/invoice_type_code")}>${esc(docTitle(invoice, t))}</div>
        <div class="inv-id"${a.at("/invoice_number")}>${esc(invoice.invoice_number)}</div>
        ${precedingHtml}
      </div>
      <div class="inv-header-right">
        ${rows.join("\n        ")}
      </div>
    </div>`;
}

/** Address lines. Annotated, post code and city are each addressable, and an
 *  absent one has a slot on their shared line. */
function addressRows(addr: AddressLike, base: string, t: TFunction, a: Annotator): string[] {
  if (!a.on) return addressLines(addr).map((l) => `<div>${esc(l)}</div>`);
  const rows: string[] = [];
  for (const k of ["line1", "line2", "line3"] as const) {
    const v = addr[k];
    if (v) rows.push(`<div${a.at(`${base}/${k}`)}>${esc(v)}</div>`);
  }
  const part = (k: "post_code" | "city", label: string) => {
    const v = addr[k];
    return v ? a.wrap(`${base}/${k}`, esc(v)) : a.slot(`${base}/${k}`, label);
  };
  rows.push(`<div>${part("post_code", viewLabel(t, "postCode"))} ${part("city", viewLabel(t, "city"))}</div>`);
  if (addr.country_subdivision) rows.push(`<div${a.at(`${base}/country_subdivision`)}>${esc(addr.country_subdivision)}</div>`);
  if (addr.country_code) rows.push(`<div${a.at(`${base}/country_code`)}>${esc(addr.country_code)}</div>`);
  return rows;
}

/** A party block. `base` is its pointer; `main` marks the seller and buyer,
 *  whose tax and contact details get slots when absent. */
function partyBlock(party: PartyLike | undefined, label: string, t: TFunction, a: Annotator, base: string, main: boolean, extraLines: readonly string[] = []): string {
  if (!party) return "";
  const rows: string[] = [];
  const row = (path: string, key: "identifier" | "vatId" | "taxRegId" | "regId" | "eAddress", value: string) =>
    `<div${a.at(path)}><span class="inv-label">${viewLabel(t, key)}</span> ${esc(value)}</div>`;
  const slot = (path: string, key: PlainViewKey) => a.slot(path, viewLabel(t, key), "div");

  if (party.name) {
    rows.push(`<div class="inv-party-name"${a.at(`${base}/name`)}>${esc(party.name)}</div>`);
  }
  if (party.trading_name && party.trading_name !== party.name) {
    rows.push(`<div class="inv-party-trading"${a.at(`${base}/trading_name`)}>${esc(party.trading_name)}</div>`);
  }
  if (party.address) rows.push(...addressRows(party.address, `${base}/address`, t, a));
  else rows.push(slot(`${base}/address`, "address"));
  // BT-29 (seller: array) / BT-46, BT-60 (buyer, payee: single object).
  (party.identifiers || []).forEach((ident, i) => {
    if (ident?.id) rows.push(row(`${base}/identifiers/${i}`, "identifier", schemeVal(ident)));
  });
  if (party.identifier?.id) {
    rows.push(row(`${base}/identifier`, "identifier", schemeVal(party.identifier)));
  }
  if (party.vat_id) rows.push(row(`${base}/vat_id`, "vatId", party.vat_id));
  else if (main) rows.push(slot(`${base}/vat_id`, "vatId"));
  if (party.tax_registration_id) rows.push(row(`${base}/tax_registration_id`, "taxRegId", party.tax_registration_id));
  else if (base === "/seller") rows.push(slot(`${base}/tax_registration_id`, "taxRegId")); // the buyer has none
  if (party.legal_registration_id?.id) {
    rows.push(row(`${base}/legal_registration_id`, "regId", schemeVal(party.legal_registration_id)));
  }
  // BT-34 / BT-49 electronic address (id + CEF/EAS scheme).
  if (party.electronic_address?.id) rows.push(row(`${base}/electronic_address`, "eAddress", schemeVal(party.electronic_address)));
  else if (main) rows.push(slot(`${base}/electronic_address`, "eAddress"));
  if (party.additional_legal_info) {
    rows.push(`<div class="inv-party-legal"${a.at(`${base}/additional_legal_info`)}>${esc(party.additional_legal_info)}</div>`);
  }
  if (party.contact) {
    const c = party.contact, p = `${base}/contact`;
    if (a.on) {
      // Every part addressable, an absent one as a slot; separators sit
      // between the parts so a hidden slot can hide its own.
      const part = (k: "name" | "phone" | "email", key: "contactName" | "phone" | "email") => {
        const v = c[k];
        return v ? a.wrap(`${p}/${k}`, esc(v)) : a.slot(`${p}/${k}`, viewLabel(t, key));
      };
      rows.push(`<div class="inv-party-contact"${a.at(p)}>${[part("name", "contactName"), part("phone", "phone"), part("email", "email")].join('<span class="inv-sep"> · </span>')}</div>`);
    } else {
      const bits = [c.name, c.phone, c.email].filter(Boolean);
      if (bits.length) {
        rows.push(`<div class="inv-party-contact">${bits.map(esc).join(" · ")}</div>`);
      }
    }
  } else if (main) {
    rows.push(slot(`${base}/contact`, "contact"));
  }
  for (const extra of extraLines) rows.push(extra);

  return `<div class="inv-party"${a.at(base)}><div class="inv-party-label">${esc(label)}</div>${rows.join("")}</div>`;
}

function partiesBlock(invoice: RenderableInvoice, t: TFunction, a: Annotator): string {
  const buyerExtras = invoice.buyer_reference
    ? [`<div${a.at("/buyer_reference")}><span class="inv-label">Ref</span> ${esc(invoice.buyer_reference)}</div>`]
    : [a.slot("/buyer_reference", viewLabel(t, "buyerReference"), "div")];

  const primary = `
    <div class="inv-parties">
      ${partyBlock(invoice.seller, viewLabel(t, "from"), t, a, "/seller", true)}
      ${partyBlock(invoice.buyer,  viewLabel(t, "to"),  t, a, "/buyer", true, buyerExtras)}
    </div>`;

  // Secondary parties only appear when present (payee, tax rep, deliver-to).
  const secondaries: string[] = [];

  if (invoice.payee) {
    secondaries.push(partyBlock(invoice.payee, viewLabel(t, "payee"), t, a, "/payee", false));
  }
  if (invoice.seller_tax_representative) {
    secondaries.push(partyBlock(invoice.seller_tax_representative, viewLabel(t, "taxRep"), t, a, "/seller_tax_representative", false));
  }
  const d = invoice.delivery;
  if (d && (d.name || d.address?.line1 || d.location_id?.id)) {
    const extras: string[] = [];
    if (d.location_id?.id) {
      extras.push(`<div${a.at("/delivery/location_id")}><span class="inv-label">${viewLabel(t, "identifier")}</span> ${esc(schemeVal(d.location_id))}</div>`);
    }
    // The deliver-to block is the delivery itself: its name and address are
    // /delivery/name and /delivery/address.
    const party: PartyLike = {};
    if (d.name !== undefined) party.name = d.name;
    if (d.address !== undefined) party.address = d.address;
    secondaries.push(partyBlock(party, viewLabel(t, "deliverTo"), t, a, "/delivery", false, extras));
  }

  const secondaryHtml = secondaries.length
    ? `<div class="inv-parties-secondary">${secondaries.join("")}</div>`
    : "";

  return primary + secondaryHtml;
}

function referencesBlock(invoice: RenderableInvoice, t: TFunction, a: Annotator): string {
  const refs: string[] = [];
  let shown = 0;
  const push = (path: string, key: PlainViewKey, value: string | undefined) => {
    const label = viewLabel(t, key);
    if (value) {
      shown++;
      refs.push(`<div class="inv-ref"${a.at(path)}><span class="inv-ref-label">${esc(label)}</span><span class="inv-ref-value">${esc(value)}</span></div>`);
    } else refs.push(a.slot(path, label, "div"));
  };

  push("/purchase_order_reference",   "purchaseOrder",    invoice.purchase_order_reference);
  push("/contract_reference",         "contract",         invoice.contract_reference);
  push("/project_reference",          "project",          invoice.project_reference);
  push("/sales_order_reference",      "salesOrder",       invoice.sales_order_reference);
  push("/despatch_advice_reference",  "despatchAdvice",   invoice.despatch_advice_reference);
  push("/receiving_advice_reference", "receivingAdvice",  invoice.receiving_advice_reference);
  push("/tender_or_lot_reference",    "tender",           invoice.tender_or_lot_reference);
  push("/object_identifier",          "objectIdentifier", schemeVal(invoice.object_identifier));
  push("/buyer_accounting_reference", "accountingRef",    invoice.buyer_accounting_reference);

  const rows = refs.join("");
  // Nothing to show: no block. Annotated, the slots keep an empty container
  // the stylesheet hides until one is revealed.
  if (shown === 0) return a.on ? `<div class="inv-references inv-references--empty">${rows}</div>` : "";
  return `<div class="inv-references">${rows}</div>`;
}

/** `start – end`, each date addressable when annotated. */
function periodRange(period: { start_date?: string; end_date?: string }, base: string, lang: Lang, a: Annotator): string {
  if (!a.on) return dateRange(period.start_date, period.end_date, lang);
  const { start_date: start, end_date: end } = period;
  if (start && end && start !== end) {
    return `${a.wrap(`${base}/start_date`, fmtDate(start, lang))} – ${a.wrap(`${base}/end_date`, fmtDate(end, lang))}`;
  }
  return start ? a.wrap(`${base}/start_date`, fmtDate(start, lang)) : a.wrap(`${base}/end_date`, fmtDate(end || "", lang));
}

function periodBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang, a: Annotator): string {
  // BT-72 and BG-14 are independent in EN 16931 (BR-IC-11 accepts either or
  // both) — render both when both exist.
  const rows: string[] = [];
  const period = invoice.delivery?.period;
  if (period?.start_date || period?.end_date) {
    rows.push(`<div class="inv-period"${a.at("/delivery/period")}>
      <span class="inv-label">${viewLabel(t, "invoicingPeriod")}</span>
      ${periodRange(period, "/delivery/period", lang, a)}
    </div>`);
  } else {
    rows.push(a.slot("/delivery/period", viewLabel(t, "invoicingPeriod"), "div"));
  }
  if (invoice.delivery?.date) {
    rows.push(`<div class="inv-period"${a.at("/delivery/date")}>
      <span class="inv-label">${viewLabel(t, "deliveryDate")}</span>
      ${fmtDate(invoice.delivery.date, lang)}
    </div>`);
  } else {
    rows.push(a.slot("/delivery/date", viewLabel(t, "deliveryDate"), "div"));
  }
  return rows.join("");
}

function notesBlock(invoice: RenderableInvoice, t: TFunction, a: Annotator): string {
  const notes = invoice.notes || [];
  if (notes.length === 0) return "";
  const items = notes.map((n, i) => {
    const code = n.subject_code ? `<span class="inv-note-code"${a.at(`/notes/${i}/subject_code`)}>${esc(n.subject_code)}</span> ` : "";
    return `<p${a.at(`/notes/${i}`)}>${code}${esc(n.text)}</p>`;
  }).join("");
  return `<div class="inv-notes"${a.at("/notes")}>
    <div class="inv-section-label">${esc(viewLabel(t, "notes"))}</div>
    ${items}
  </div>`;
}

function linesBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang, a: Annotator): string {
  const lines = invoice.lines || [];
  const rows = lines.map((line, li) => {
    const L = `/lines/${li}`;
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
    const pushMeta = (path: string, label: string, value: string | undefined) => {
      if (value) meta.push(`<div class="inv-line-meta"${a.at(path)}><span class="inv-label">${label}</span> ${esc(value)}</div>`);
    };
    if (line.period?.start_date || line.period?.end_date) {
      meta.push(`<div class="inv-line-meta"${a.at(`${L}/period`)}><span class="inv-label">${viewLabel(t, "linePeriod")}</span> ${periodRange(line.period, `${L}/period`, lang, a)}</div>`);
    } else {
      meta.push(a.slot(`${L}/period`, viewLabel(t, "linePeriod"), "div"));
    }
    if (line.note) meta.push(`<div class="inv-line-meta"${a.at(`${L}/note`)}>${esc(line.note)}</div>`);
    pushMeta(`${L}/item/seller_id`,   viewLabel(t, "itemSellerId"),   item.seller_id);
    pushMeta(`${L}/item/buyer_id`,    viewLabel(t, "itemBuyerId"),    item.buyer_id);
    pushMeta(`${L}/item/standard_id`, viewLabel(t, "itemStandardId"), schemeVal(item.standard_id));
    (item.classifications || []).forEach((c, ci) => {
      const scheme = [c.scheme_id, c.version].filter(Boolean).join(" ");
      pushMeta(`${L}/item/classifications/${ci}`, viewLabel(t, "classification"), scheme ? `${c.id} (${scheme})` : c.id);
    });
    // Where another classification or attribute would go.
    meta.push(a.slot(`${L}/item/classifications`, viewLabel(t, "classification"), "div"));
    pushMeta(`${L}/item/country_of_origin`, viewLabel(t, "origin"), item.country_of_origin);
    (item.attributes || []).forEach((at, ai) => {
      if (at?.name) pushMeta(`${L}/item/attributes/${ai}`, esc(at.name), at.value);
    });
    meta.push(a.slot(`${L}/item/attributes`, viewLabel(t, "itemAttribute"), "div"));
    pushMeta(`${L}/order_line_reference`,       viewLabel(t, "orderLine"),        line.order_line_reference);
    pushMeta(`${L}/object_identifier`,          viewLabel(t, "objectIdentifier"), schemeVal(line.object_identifier));
    pushMeta(`${L}/buyer_accounting_reference`, viewLabel(t, "accountingRef"),    line.buyer_accounting_reference);

    // Line-level allowances and charges: shown inline under the description,
    // with their percentage/base derivation and reason (code) when present.
    // A no-break space (U+00A0) keeps each sign on the line of its amount.
    (line.allowances || []).forEach((x, i) => {
      meta.push(`<div class="inv-line-allowance"${a.at(`${L}/allowances/${i}`)}>− ${amt(x.amount, lang)} · ${esc(acReason(x, viewLabel(t, "documentAllowance"), t, lang))}</div>`);
    });
    (line.charges || []).forEach((x, i) => {
      meta.push(`<div class="inv-line-charge"${a.at(`${L}/charges/${i}`)}>+ ${amt(x.amount, lang)} · ${esc(acReason(x, viewLabel(t, "documentCharge"), t, lang))}</div>`);
    });

    // Show gross + discount alongside the net price when the invoice carries
    // both (e.g. "100.00" over "was 120.00 (− 20.00)").
    let priceCell = a.wrap(`${L}/price/net_price`, amt(netPrice, lang));
    if (grossPrice != null && (discount != null || Number(grossPrice) !== Number(netPrice))) {
      const was = viewLabel(t, "priceBefore", { price: amt(grossPrice, lang) });
      const disc = discount != null ? ` (− ${amt(discount, lang)})` : "";
      priceCell += a.on
        ? `<div class="inv-line-price-gross"${a.at(`${L}/price/gross_price`)}>${esc(was)}${discount != null ? ` (− ${a.wrap(`${L}/price/discount`, amt(discount, lang))})` : ""}</div>`
        : `<div class="inv-line-price-gross">${esc(was + disc)}</div>`;
    }
    // BT-149/150: a price expressed per N units, not per 1.
    const baseQty = line.price?.base_quantity;
    if (baseQty != null && Number(baseQty) !== 1) {
      const baseUnit = line.price?.base_quantity_unit_code;
      if (a.on) {
        const qtyHtml = a.wrap(`${L}/price/base_quantity`, num(baseQty, lang)) +
          (baseUnit ? ` ${a.wrap(`${L}/price/base_quantity_unit_code`, esc(unitLabel(baseUnit, baseQty, t)))}` : "");
        // The "per {qty}" string is escaped as a whole; here the qty carries
        // markup, so it goes in after escaping, in place of a placeholder.
        priceCell += `<div class="inv-line-price-base">${esc(viewLabel(t, "perBase", { qty: "\u0000" })).replace("\u0000", qtyHtml)}</div>`;
      } else {
        const qtyText = baseUnit
          ? `${num(baseQty, lang)} ${unitLabel(baseUnit, baseQty, t)}`
          : num(baseQty, lang);
        priceCell += `<div class="inv-line-price-base">${esc(viewLabel(t, "perBase", { qty: qtyText }))}</div>`;
      }
    }

    // BT-151/152: the rate, plus the category letter whenever it isn't the
    // standard rate — Z/E/AE/K/G/O lines must be visibly not-just-0%.
    let vatCell = "";
    if (taxRate != null) vatCell = a.wrap(`${L}/vat/rate`, `${num(taxRate, lang)} %`);
    if (taxCat && taxCat !== "S") {
      vatCell += `${vatCell ? " " : ""}<span class="inv-line-vatcat"${a.at(`${L}/vat/category_code`)}>${esc(taxCat)}</span>`;
    }

    const qtyCell = a.on
      ? `${qty != null && qty !== "" ? a.wrap(`${L}/quantity`, num(qty, lang)) : a.slot(`${L}/quantity`, viewLabel(t, "quantity"))}${unit ? ` ${a.wrap(`${L}/unit_code`, esc(unitLabel(unit, qty, t)))}` : ""}`
      : `${num(qty, lang)}${unit ? ` ${esc(unitLabel(unit, qty, t))}` : ""}`;

    return `
    <tr role="row"${a.at(L)}>
      <td role="cell" class="inv-col-id"${a.at(`${L}/id`)}>${esc(line.id)}</td>
      <td role="cell" class="inv-col-desc">
        <div class="inv-line-name"${a.at(`${L}/item/name`)}>${esc(name)}</div>
        ${desc ? `<div class="inv-line-desc"${a.at(`${L}/item/description`)}>${esc(desc)}</div>` : ""}
        ${meta.join("")}
      </td>
      <td role="cell" class="inv-col-num inv-col-qty">${qtyCell}</td>
      <td role="cell" class="inv-col-num inv-col-price"${a.at(`${L}/price`)}>${priceCell}</td>
      <td role="cell" class="inv-col-num inv-col-vat"${a.at(`${L}/vat`)}>${vatCell}</td>
      <td role="cell" class="inv-col-num inv-col-net"${a.at(`${L}/net_amount`)}>${amt(total, lang)}</td>
    </tr>`;
  }).join("");

  // The roles restate what the elements already are: a narrow paper lays the
  // rows out as grids (styles/invoice.css), and some engines (WebKit) drop a
  // table's semantics once its parts stop being displayed as table parts.
  return `
    <div class="inv-lines-wrap"${a.at("/lines")}>
      <table role="table" class="data-table inv-lines">
        <thead role="rowgroup"><tr role="row">
          <th role="columnheader" class="inv-col-id">${viewLabel(t, "lineNo")}</th>
          <th role="columnheader" class="inv-col-desc">${viewLabel(t, "description")}</th>
          <th role="columnheader" class="inv-col-num inv-col-qty">${viewLabel(t, "quantity")}</th>
          <th role="columnheader" class="inv-col-num inv-col-price">${viewLabel(t, "unitPrice")}</th>
          <th role="columnheader" class="inv-col-num inv-col-vat">${viewLabel(t, "taxRate")}</th>
          <th role="columnheader" class="inv-col-num inv-col-net">${viewLabel(t, "lineTotal")}</th>
        </tr></thead>
        <tbody role="rowgroup">${rows}</tbody>
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
// `paths` lists the fields each row shows (a merged row shows several).
function totalsBlock(invoice: RenderableInvoice, t: TFunction, lang: Lang, a: Annotator): string {
  const cur = invoice.currency_code;
  const tot = invoice.totals || {};
  const money = (v: unknown) => curAmt(v, cur, lang);
  const signed = (sign: "+" | "−", v: unknown) => `${sign} ${money(v)}`;
  const same = (a: unknown, b: unknown) => a != null && b != null && Number(a) === Number(b);
  const has = <T>(v: T | null | undefined): v is T => v != null;
  const rows: TotalsRow[] = [];
  const row = (label: string, value: string, paths: string | readonly (string | false)[], cls = ""): TotalsRow => {
    const r: TotalsRow = { label, value, paths: [paths].flat().filter((p): p is string => Boolean(p)), cls };
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
      row(viewLabel(t, "netTotal"), money(v), [has(tot.line_net_total) && "/totals/line_net_total", has(tot.tax_exclusive_amount) && "/totals/tax_exclusive_amount"], "inv-totals-sum");
    }
  } else {
    if (has(tot.line_net_total)) row(viewLabel(t, "subtotal"), money(tot.line_net_total), "/totals/line_net_total");
    allowances.forEach((x, i) => {
      row(esc(acReason(x, viewLabel(t, "documentAllowance"), t, lang)), signed("−", x.amount), `/document_allowances/${i}`);
    });
    if (has(tot.allowance_total) && !(allowances.length === 1 && same(allowances[0]?.amount, tot.allowance_total))) {
      row(viewLabel(t, "allowanceTotal"), signed("−", tot.allowance_total), "/totals/allowance_total");
    } else if (has(tot.allowance_total)) rows.at(-1)?.paths.push("/totals/allowance_total"); // the one allowance's row
    charges.forEach((x, i) => {
      row(esc(acReason(x, viewLabel(t, "documentCharge"), t, lang)), signed("+", x.amount), `/document_charges/${i}`);
    });
    if (has(tot.charge_total) && !(charges.length === 1 && same(charges[0]?.amount, tot.charge_total))) {
      row(viewLabel(t, "chargeTotal"), signed("+", tot.charge_total), "/totals/charge_total");
    } else if (has(tot.charge_total)) rows.at(-1)?.paths.push("/totals/charge_total"); // the one charge's row
    if (has(tot.tax_exclusive_amount)) row(viewLabel(t, "netTotal"), money(tot.tax_exclusive_amount), "/totals/tax_exclusive_amount", "inv-totals-sum");
  }

  // BG-23, then BT-110
  const vat = invoice.vat_breakdown || [];
  let lastVat: TotalsRow | null = null;
  vat.forEach((g, i) => {
    const V = `/vat_breakdown/${i}`;
    const rateLabel = viewLabel(t, "taxTotal", { rate: num(g.rate ?? 0, lang) });
    const catLabel = g.category_code && g.category_code !== "S"
      ? ` · ${a.wrap(`${V}/category_code`, esc(codeLabel(t, "vatCategory", g.category_code)))}`
      : "";
    const taxable = a.wrap(`${V}/taxable_amount`, curAmt(stated(g.taxable_amount), cur, lang));
    lastVat = row(`${a.wrap(`${V}/rate`, esc(rateLabel))}${catLabel}<span class="inv-vat-base"> · ${viewLabel(t, "taxableAmount")} ${taxable}</span>`,
      a.wrap(`${V}/tax_amount`, curAmt(stated(g.tax_amount), cur, lang)), V, "inv-vat-row");
    if (g.reason || g.reason_code) {
      const reason = g.reason
        ? (g.reason_code ? `${g.reason} (${g.reason_code})` : g.reason)
        : g.reason_code;
      rows.push({ label: esc(reason), value: null, paths: [g.reason && `${V}/reason`, g.reason_code && `${V}/reason_code`].filter((x): x is string => Boolean(x)), cls: "inv-vat-reason" });
    }
  });
  if (has(tot.tax_amount)) {
    if (vat.length === 1 && lastVat !== null && same(vat[0]?.tax_amount, tot.tax_amount)) (lastVat as TotalsRow).paths.push("/totals/tax_amount");
    else row(viewLabel(t, "vatTotal"), money(tot.tax_amount), "/totals/tax_amount", "inv-totals-sum");
  }

  // BT-111: VAT total restated in the accounting currency (BT-6).
  const acctCur = invoice.vat_accounting_currency_code;
  const acctVat = invoice.totals?.tax_amount_accounting_currency
    ?? invoice.tax_amount_accounting_currency;
  if (acctCur && acctVat != null) {
    row(esc(viewLabel(t, "taxTotalIn", { cur: acctCur })), curAmt(acctVat, acctCur, lang), "/tax_amount_accounting_currency", "inv-vat-row");
  }

  // BT-112 → BT-115
  const prepaid = Number(tot.prepaid_amount ?? 0);
  const rounding = Number(tot.rounding_amount ?? 0);
  if (prepaid === 0 && rounding === 0
      && (!has(tot.tax_inclusive_amount) || !has(tot.amount_due) || same(tot.tax_inclusive_amount, tot.amount_due))) {
    const v = tot.amount_due ?? tot.tax_inclusive_amount;
    if (has(v)) row(viewLabel(t, "payable"), money(v), [has(tot.tax_inclusive_amount) && "/totals/tax_inclusive_amount", has(tot.amount_due) && "/totals/amount_due"], "inv-totals-payable");
  } else {
    if (has(tot.tax_inclusive_amount)) row(viewLabel(t, "grossTotal"), money(tot.tax_inclusive_amount), "/totals/tax_inclusive_amount", "inv-totals-sum");
    // Sign-faithful: a positive prepaid is subtracted, a negative one added.
    if (prepaid !== 0) row(viewLabel(t, "prepaid"), signed(prepaid > 0 ? "−" : "+", Math.abs(prepaid)), "/totals/prepaid_amount");
    if (rounding !== 0) row(viewLabel(t, "rounding"), signed(rounding > 0 ? "+" : "−", Math.abs(rounding)), "/totals/rounding_amount");
    if (has(tot.amount_due)) row(viewLabel(t, "payable"), money(tot.amount_due), "/totals/amount_due", "inv-totals-payable");
  }

  // Annotated, an accounting currency without its VAT total gets a slot.
  const acctSlot = acctCur && acctVat == null
    ? a.slot("/tax_amount_accounting_currency", viewLabel(t, "taxTotalIn", { cur: acctCur }), "tr")
    : "";

  if (rows.length === 0 && !acctSlot) return "";
  const html = rows.map((r) => {
    const cls = r.cls ? ` class="${r.cls}"` : "";
    const at = a.at(...r.paths);
    if (r.value === null) return `<tr${cls}${at}><td colspan="2">${r.label}</td></tr>`;
    return `<tr${cls}${at}><td>${r.label}</td><td class="inv-col-num">${r.value}</td></tr>`;
  });
  return `<div class="inv-totals-wrap">
    <table class="inv-totals"${a.at("/totals")}><tbody>${html.join("")}${acctSlot}</tbody></table>
  </div>`;
}

// BG-24: additional supporting documents — reference, description, and where
// the document lives (URL or embedded file).
function supportingDocsBlock(invoice: RenderableInvoice, t: TFunction, a: Annotator): string {
  const docs = invoice.supporting_documents || [];
  if (docs.length === 0) return "";
  const rows = docs.map((d, i) => {
    const D = `/supporting_documents/${i}`;
    const bits: string[] = [];
    if (d.reference) bits.push(`<span class="inv-doc-ref"${a.at(`${D}/reference`)}>${esc(d.reference)}</span>`);
    if (d.description) bits.push(a.wrap(`${D}/description`, esc(d.description)));
    if (d.attached_document?.filename) bits.push(a.wrap(`${D}/attached_document`, esc(d.attached_document.filename)));
    if (d.external_location) bits.push(`<span class="inv-doc-url"${a.at(`${D}/external_location`)}>${esc(d.external_location)}</span>`);
    return `<div class="inv-doc"${a.at(D)}>${bits.join(" · ")}</div>`;
  }).join("");
  return `<div class="inv-docs"${a.at("/supporting_documents")}>
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

function paymentBlock(invoice: RenderableInvoice, t: TFunction, a: Annotator): string {
  const p = invoice.payment;
  if (!p) return a.slot("/payment", viewLabel(t, "paymentInstructions"), "div");
  const rows: string[] = [];
  let shown = 0;
  const row = (path: string, key: "iban" | "bic" | "accountName" | "cardNumber" | "cardHolder" | "mandateReference" | "creditorId" | "debitedAccount" | "remittance", value: string | undefined, slotted = false) => {
    if (value) {
      shown++;
      return `<div${a.at(path)}><span class="inv-label">${viewLabel(t, key)}</span> ${esc(value)}</div>`;
    }
    return slotted ? a.slot(path, viewLabel(t, key), "div") : "";
  };
  // Annotated, each means is one addressable group.
  const group = (path: string, inner: string) => (a.on ? `<div class="inv-pay-group"${a.at(path)}>${inner}</div>` : inner);

  const means = paymentMeansLabel(p, t);
  if (means) {
    shown++;
    const shows = [p.means_code && "/payment/means_code", p.means_text && "/payment/means_text"].filter((x): x is string => Boolean(x));
    rows.push(`<div${a.at(...shows)}><span class="inv-label">${viewLabel(t, "paymentMeans")}</span> ${esc(means)}</div>`);
  }

  // BG-17 credit transfers (one or more).
  const transfers = p.credit_transfers || [];
  transfers.forEach((ct, i) => {
    const C = `/payment/credit_transfers/${i}`;
    rows.push(group(C, [
      row(`${C}/account_id`, "iban", ct.account_id),
      row(`${C}/service_provider_id`, "bic", ct.service_provider_id),
      row(`${C}/account_name`, "accountName", ct.account_name),
    ].join("")));
  });
  if (!transfers.length) rows.push(a.slot("/payment/credit_transfers", viewLabel(t, "creditTransfer"), "div"));

  // BG-18 payment card (masked PAN + holder name).
  if (p.card) {
    rows.push(group("/payment/card", [
      row("/payment/card/account_number", "cardNumber", p.card.account_number),
      row("/payment/card/holder_name", "cardHolder", p.card.holder_name),
    ].join("")));
  } else {
    rows.push(a.slot("/payment/card", viewLabel(t, "card"), "div"));
  }

  // BG-19 direct debit (mandate reference, creditor ID, debited account).
  const dd = p.direct_debit;
  if (dd) {
    rows.push(group("/payment/direct_debit", [
      row("/payment/direct_debit/mandate_reference", "mandateReference", dd.mandate_reference, true),
      row("/payment/direct_debit/creditor_id", "creditorId", dd.creditor_id, true),
      row("/payment/direct_debit/debited_account_id", "debitedAccount", dd.debited_account_id, true),
    ].join("")));
  } else {
    rows.push(a.slot("/payment/direct_debit", viewLabel(t, "directDebit"), "div"));
  }

  if (p.remittance_information) rows.push(row("/payment/remittance_information", "remittance", p.remittance_information));

  if (shown === 0) return a.slot("/payment", viewLabel(t, "paymentInstructions"), "div");
  return `<div class="inv-payment"${a.at("/payment")}>
    <div class="inv-section-label">${esc(viewLabel(t, "paymentInstructions"))}</div>
    ${rows.join("")}
  </div>`;
}

function paymentTermsBlock(invoice: RenderableInvoice, t: TFunction, a: Annotator): string {
  if (!invoice.payment_terms) return a.slot("/payment_terms", viewLabel(t, "paymentTerms"), "div");
  return `<div class="inv-payment-terms"${a.at("/payment_terms")}>
    <span class="inv-label">${viewLabel(t, "paymentTerms")}</span> ${esc(invoice.payment_terms)}
  </div>`;
}

// ── Entry point ──────────────────────────────────────────────────────────

/** Options of `renderInvoice`. */
export interface RenderOptions {
  /** The label resolver: `(key, vars?) => string`, returning the key unchanged
   *  on a miss. `makeT(lang)` is the default one. */
  t: TFunction;
  /** Drives date and number formatting (deterministic — the process locale is
   *  never consulted). Default `"en"`. */
  lang?: Lang;
  /** Mark every rendered field with `data-path` and leave a hidden, labelled
   *  slot where an absent one would render, for a host to point at fields
   *  (see the `highlight` entry point). Default off: plain markup. */
  annotate?: boolean;
}

/**
 * Render the invoice as an HTML fragment (no document chrome). See
 * `renderInvoiceDocument` for a batteries-included wrapper.
 */
export function renderInvoice(invoice: RenderableInvoice, { t, lang = DEFAULT_LANG, annotate = false }: RenderOptions): string {
  const a = annotator(annotate, t);
  return `
    <div class="invoice-paper"${a.at("")}>
      ${headerBlock(invoice, t, lang, a)}
      ${partiesBlock(invoice, t, a)}
      ${referencesBlock(invoice, t, a)}
      ${periodBlock(invoice, t, lang, a)}
      ${notesBlock(invoice, t, a)}
      ${linesBlock(invoice, t, lang, a)}
      ${totalsBlock(invoice, t, lang, a)}
      ${supportingDocsBlock(invoice, t, a)}
      ${paymentBlock(invoice, t, a)}
      ${paymentTermsBlock(invoice, t, a)}
    </div>`;
}
