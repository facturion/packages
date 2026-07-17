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
// own. The net/total math comes from @facturion/invoice.
// Import from the pure ./model subpath, not the package root — the root eagerly
// compiles Ajv validators at load, which we don't want dragged into the renderer
// (and, transitively, the browser) bundle just for the net/total math.
import { computeTotals, lineNet } from "@facturion/invoice/model";
import { DEFAULT_LANG } from "./i18n.js";

export { computeTotals, lineNet };

// Shared formatting helpers. All of them format deterministically from the
// document language — never from the process locale, so the same invoice
// renders byte-identically on any host (Lambda ICU builds differ).
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const _SEPARATORS = {
  en: { group: ",", decimal: "." },
  de: { group: ".", decimal: "," },
};

function _formatNumber(n, lang, minFraction) {
  const sep = _SEPARATORS[lang] ?? _SEPARATORS[DEFAULT_LANG];
  const abs = Math.abs(n);
  let intPart, fracPart;
  if (minFraction != null) {
    [intPart, fracPart] = abs.toFixed(minFraction).split(".");
  } else {
    [intPart, fracPart] = String(abs).split(".");
  }
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep.group);
  const frac = fracPart ? sep.decimal + fracPart : "";
  // U+2212 minus sign, matching the sign glyph used elsewhere on the document.
  return `${n < 0 ? "−" : ""}${intPart}${frac}`;
}

/** Two-decimal amount in the document language (EN 16931 Amounts are 2dp). */
export function amt(value, lang = DEFAULT_LANG) {
  const n = Number(value);
  if (!isFinite(n)) return esc(value ?? "—");
  return _formatNumber(n, lang, 2);
}

export function curAmt(value, cur, lang = DEFAULT_LANG) {
  // U+00A0 (no-break space) keeps the amount and its currency on one line.
  return cur ? `${amt(value, lang)} ${esc(cur)}` : amt(value, lang);
}

/** Quantities, rates, percentages: unlimited precision, localized separators. */
export function num(value, lang = DEFAULT_LANG) {
  const n = Number(value);
  if (!isFinite(n)) return esc(value ?? "");
  return _formatNumber(n, lang);
}

/** ISO dates localize for German (17.07.2026); other languages keep the
 *  unambiguous ISO form. Non-ISO input passes through untouched. */
export function fmtDate(value, lang = DEFAULT_LANG) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return esc(value ?? "");
  if (lang === "de") return `${m[3]}.${m[2]}.${m[1]}`;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unitLabel(code, qty, t) {
  if (!code) return "";
  const plural = Number(qty) !== 1;
  const key = "units." + code + (plural ? "_plural" : "");
  const label = t(key);
  return label === key ? code : label;
}

function dateRange(start, end, lang) {
  if (start && end && start !== end) return `${fmtDate(start, lang)} – ${fmtDate(end, lang)}`;
  return fmtDate(start || end || "", lang);
}

/** Scheme-qualified identifier display: `id (scheme_id)`. */
function schemeVal(obj) {
  if (!obj?.id) return "";
  return obj.scheme_id ? `${obj.id} (${obj.scheme_id})` : obj.id;
}

function addressLines(addr) {
  if (!addr) return [];
  const lines = [];
  if (addr.line1) lines.push(addr.line1);
  if (addr.line2) lines.push(addr.line2);
  if (addr.line3) lines.push(addr.line3);
  const pcCity = [addr.post_code, addr.city].filter(Boolean).join(" ");
  if (pcCity) lines.push(pcCity);
  if (addr.country_subdivision) lines.push(addr.country_subdivision);
  if (addr.country_code) lines.push(addr.country_code);
  return lines;
}

/** Reason display for allowances/charges: text, code, or the generic label,
 *  plus the percentage/base derivation when the document carries it. */
function acReason(x, fallback, t, lang) {
  let label = x.reason || x.reason_code || fallback;
  if (x.reason && x.reason_code) label = `${x.reason} (${x.reason_code})`;
  const bits = [];
  if (x.percentage != null) bits.push(`${num(x.percentage, lang)} %`);
  if (x.base_amount != null) bits.push(`${t("view.of")} ${amt(x.base_amount, lang)}`);
  return bits.length ? `${label} (${bits.join(" ")})` : label;
}

// ── Section builders ──────────────────────────────────────────────────────

/** BT-3 → document title. 380 and unknown codes keep the friendly "Invoice";
 *  381 keeps the established "Credit Note"; every other UNCL 1001 code takes
 *  its codelist label (e.g. 384 → "Corrected invoice"/"Rechnungskorrektur"). */
function docTitle(invoice, t) {
  const code = invoice.invoice_type_code;
  if (!code || code === "380") return t("view.invoice");
  if (code === "381") return t("view.creditNote");
  const key = "invoiceTypes." + code;
  const label = t(key);
  return label && label !== key && label !== code ? label : t("view.invoice");
}

function headerBlock(invoice, t, lang) {
  // BG-3 sits under the document number: on a corrective document the link to
  // the preceding invoice is part of its identity, not a footnote reference.
  const preceding = (invoice.preceding_invoices || [])
    .map(p => (p.issue_date ? `${p.reference} (${fmtDate(p.issue_date, lang)})` : p.reference))
    .join(", ");

  const rows = [];
  rows.push(`<div><span class="inv-label">${t("view.issueDate")}</span> ${fmtDate(invoice.issue_date, lang)}</div>`);
  if (invoice.due_date) {
    rows.push(`<div><span class="inv-label">${t("view.dueDate")}</span> ${fmtDate(invoice.due_date, lang)}</div>`);
  }
  // BT-7 / BT-8 are mutually exclusive per the model; render whichever exists.
  if (invoice.tax_point_date) {
    rows.push(`<div><span class="inv-label">${t("view.taxPointDate")}</span> ${fmtDate(invoice.tax_point_date, lang)}</div>`);
  } else if (invoice.tax_point_date_code) {
    rows.push(`<div><span class="inv-label">${t("view.taxPointDate")}</span> ${esc(t("taxPointDateCode." + invoice.tax_point_date_code))}</div>`);
  }
  if (invoice.currency_code) {
    rows.push(`<div><span class="inv-label">${t("view.currency")}</span> ${esc(invoice.currency_code)}</div>`);
  }
  if (invoice.vat_accounting_currency_code) {
    rows.push(`<div><span class="inv-label">${t("view.vatCurrency")}</span> ${esc(invoice.vat_accounting_currency_code)}</div>`);
  }

  return `
    <div class="inv-header">
      <div class="inv-header-left">
        <div class="inv-type">${esc(docTitle(invoice, t))}</div>
        <div class="inv-id">${esc(invoice.invoice_number)}</div>
        ${preceding ? `<div class="inv-preceding"><span class="inv-label">${t("view.preceding")}</span> ${esc(preceding)}</div>` : ""}
      </div>
      <div class="inv-header-right">
        ${rows.join("\n        ")}
      </div>
    </div>`;
}

function partyBlock(party, label, t, extraLines) {
  if (!party) return "";
  const rows = [];
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
    if (ident?.id) rows.push(`<div><span class="inv-label">${t("view.identifier")}</span> ${esc(schemeVal(ident))}</div>`);
  }
  if (party.identifier?.id) {
    rows.push(`<div><span class="inv-label">${t("view.identifier")}</span> ${esc(schemeVal(party.identifier))}</div>`);
  }
  if (party.vat_id) {
    rows.push(`<div><span class="inv-label">${t("view.vatId")}</span> ${esc(party.vat_id)}</div>`);
  }
  if (party.tax_registration_id) {
    rows.push(`<div><span class="inv-label">${t("view.taxRegId")}</span> ${esc(party.tax_registration_id)}</div>`);
  }
  if (party.legal_registration_id?.id) {
    rows.push(`<div><span class="inv-label">${t("view.regId")}</span> ${esc(schemeVal(party.legal_registration_id))}</div>`);
  }
  // BT-34 / BT-49 electronic address (id + CEF/EAS scheme).
  if (party.electronic_address?.id) {
    rows.push(`<div><span class="inv-label">${t("view.eAddress")}</span> ${esc(schemeVal(party.electronic_address))}</div>`);
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
  for (const extra of extraLines || []) rows.push(extra);

  return `<div class="inv-party"><div class="inv-party-label">${esc(label)}</div>${rows.join("")}</div>`;
}

function partiesBlock(invoice, t) {
  const buyerExtras = invoice.buyer_reference
    ? [`<div><span class="inv-label">Ref</span> ${esc(invoice.buyer_reference)}</div>`]
    : [];

  const primary = `
    <div class="inv-parties">
      ${partyBlock(invoice.seller, t("view.from"), t)}
      ${partyBlock(invoice.buyer,  t("view.to"),  t, buyerExtras)}
    </div>`;

  // Secondary parties only appear when present (payee, tax rep, deliver-to).
  const secondaries = [];

  if (invoice.payee) {
    secondaries.push(partyBlock(invoice.payee, t("view.payee"), t));
  }
  if (invoice.seller_tax_representative) {
    secondaries.push(partyBlock(invoice.seller_tax_representative, t("view.taxRep"), t));
  }
  const d = invoice.delivery;
  if (d && (d.name || d.address?.line1 || d.location_id?.id)) {
    const extras = [];
    if (d.location_id?.id) {
      extras.push(`<div><span class="inv-label">${t("view.identifier")}</span> ${esc(schemeVal(d.location_id))}</div>`);
    }
    secondaries.push(partyBlock(
      { name: d.name, address: d.address },
      t("view.deliverTo"),
      t,
      extras,
    ));
  }

  const secondaryHtml = secondaries.length
    ? `<div class="inv-parties-secondary">${secondaries.join("")}</div>`
    : "";

  return primary + secondaryHtml;
}

function referencesBlock(invoice, t) {
  const refs = [];
  const push = (label, value) => { if (value) refs.push([label, value]); };

  push(t("view.purchaseOrder"),    invoice.purchase_order_reference);
  push(t("view.contract"),         invoice.contract_reference);
  push(t("view.project"),          invoice.project_reference);
  push(t("view.salesOrder"),       invoice.sales_order_reference);
  push(t("view.despatchAdvice"),   invoice.despatch_advice_reference);
  push(t("view.receivingAdvice"),  invoice.receiving_advice_reference);
  push(t("view.tender"),           invoice.tender_or_lot_reference);
  push(t("view.objectIdentifier"), schemeVal(invoice.object_identifier));
  push(t("view.accountingRef"),    invoice.buyer_accounting_reference);

  if (refs.length === 0) return "";
  const rows = refs.map(([k, v]) =>
    `<div class="inv-ref"><span class="inv-ref-label">${esc(k)}</span><span class="inv-ref-value">${esc(v)}</span></div>`
  ).join("");
  return `<div class="inv-references">${rows}</div>`;
}

function periodBlock(invoice, t, lang) {
  // BT-72 and BG-14 are independent in EN 16931 (BR-IC-11 accepts either or
  // both) — render both when both exist.
  const rows = [];
  const period = invoice.delivery?.period;
  if (period?.start_date || period?.end_date) {
    rows.push(`<div class="inv-period">
      <span class="inv-label">${t("view.invoicingPeriod")}</span>
      ${dateRange(period.start_date, period.end_date, lang)}
    </div>`);
  }
  if (invoice.delivery?.date) {
    rows.push(`<div class="inv-period">
      <span class="inv-label">${t("view.deliveryDate")}</span>
      ${fmtDate(invoice.delivery.date, lang)}
    </div>`);
  }
  return rows.join("");
}

function notesBlock(invoice, t) {
  const notes = invoice.notes || [];
  if (notes.length === 0) return "";
  const items = notes.map(n => {
    const code = n.subject_code ? `<span class="inv-note-code">${esc(n.subject_code)}</span> ` : "";
    return `<p>${code}${esc(n.text)}</p>`;
  }).join("");
  return `<div class="inv-notes">
    <div class="inv-section-label">${esc(t("view.notes"))}</div>
    ${items}
  </div>`;
}

function linesBlock(invoice, t, lang) {
  const lines = invoice.lines || [];
  const rows = lines.map(line => {
    const qty       = line.quantity;
    const unit      = line.unit_code;
    const netPrice  = line.price?.net_price;
    const grossPrice = line.price?.gross_price;
    const discount  = line.price?.discount;
    const taxRate   = line.vat?.rate;
    const taxCat    = line.vat?.category_code;
    const total     = lineNet(line);
    const item      = line.item || {};
    const name      = item.name || "";
    const desc      = item.description && item.description !== name
      ? item.description : "";

    const meta = [];
    const pushMeta = (label, value) => {
      if (value) meta.push(`<div class="inv-line-meta"><span class="inv-label">${label}</span> ${esc(value)}</div>`);
    };
    if (line.period?.start_date || line.period?.end_date) {
      meta.push(`<div class="inv-line-meta"><span class="inv-label">${t("view.linePeriod")}</span> ${dateRange(line.period.start_date, line.period.end_date, lang)}</div>`);
    }
    if (line.note) meta.push(`<div class="inv-line-meta">${esc(line.note)}</div>`);
    pushMeta(t("view.itemSellerId"),   item.seller_id);
    pushMeta(t("view.itemBuyerId"),    item.buyer_id);
    pushMeta(t("view.itemStandardId"), schemeVal(item.standard_id));
    for (const c of item.classifications || []) {
      const scheme = [c.scheme_id, c.version].filter(Boolean).join(" ");
      pushMeta(t("view.classification"), scheme ? `${c.id} (${scheme})` : c.id);
    }
    pushMeta(t("view.origin"), item.country_of_origin);
    for (const a of item.attributes || []) {
      if (a?.name) pushMeta(esc(a.name), a.value);
    }
    pushMeta(t("view.orderLine"),        line.order_line_reference);
    pushMeta(t("view.objectIdentifier"), schemeVal(line.object_identifier));
    pushMeta(t("view.accountingRef"),    line.buyer_accounting_reference);

    // Line-level allowances and charges: shown inline under the description,
    // with their percentage/base derivation and reason (code) when present.
    for (const a of line.allowances || []) {
      meta.push(`<div class="inv-line-allowance">− ${amt(a.amount, lang)} · ${esc(acReason(a, t("view.documentAllowance"), t, lang))}</div>`);
    }
    for (const c of line.charges || []) {
      meta.push(`<div class="inv-line-charge">+ ${amt(c.amount, lang)} · ${esc(acReason(c, t("view.documentCharge"), t, lang))}</div>`);
    }

    // Show gross + discount alongside the net price when the invoice carries
    // both (e.g. "100.00" over "was 120.00 (− 20.00)").
    let priceCell = amt(netPrice, lang);
    if (grossPrice != null && (discount != null || Number(grossPrice) !== Number(netPrice))) {
      const was = t("view.priceBefore", { price: amt(grossPrice, lang) });
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
      priceCell += `<div class="inv-line-price-base">${esc(t("view.perBase", { qty: qtyText }))}</div>`;
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
          <th class="inv-col-id">${t("view.lineNo")}</th>
          <th class="inv-col-desc">${t("view.description")}</th>
          <th class="inv-col-num">${t("view.quantity")}</th>
          <th class="inv-col-num">${t("view.unitPrice")}</th>
          <th class="inv-col-num">${t("view.taxRate")}</th>
          <th class="inv-col-num">${t("view.lineTotal")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function totalsBlock(invoice, t, lang, totals) {
  const cur = invoice.currency_code;
  const rows = [];

  rows.push(`<tr><td>${t("view.subtotal")}</td><td class="inv-col-num">${curAmt(totals.lineExtension, cur, lang)}</td></tr>`);

  for (const a of invoice.document_allowances || []) {
    rows.push(`<tr><td>${esc(acReason(a, t("view.documentAllowance"), t, lang))}</td><td class="inv-col-num">− ${curAmt(a.amount, cur, lang)}</td></tr>`);
  }
  for (const c of invoice.document_charges || []) {
    rows.push(`<tr><td>${esc(acReason(c, t("view.documentCharge"), t, lang))}</td><td class="inv-col-num">+ ${curAmt(c.amount, cur, lang)}</td></tr>`);
  }

  // Per-category VAT breakdown — rate, category (when not standard-rated),
  // taxable base inline, then tax amount. Exemption reason (BT-120/121)
  // renders as a subtle sub-row so readers see the compliance statement right
  // next to the 0% line.
  for (const g of totals.taxSubtotals) {
    const rateLabel = t("view.taxTotal", { rate: num(g.rate, lang) });
    const catLabel = g.category && g.category !== "S"
      ? ` · ${esc(t("vatCategory." + g.category))}`
      : "";
    rows.push(`<tr class="inv-vat-row">
      <td>${esc(rateLabel)}${catLabel}<span class="inv-vat-base"> · ${t("view.taxableAmount")} ${curAmt(g.taxable, cur, lang)}</span></td>
      <td class="inv-col-num">${curAmt(g.tax, cur, lang)}</td>
    </tr>`);
    if (g.reason || g.reason_code) {
      const reason = g.reason
        ? (g.reason_code ? `${g.reason} (${g.reason_code})` : g.reason)
        : g.reason_code;
      rows.push(`<tr class="inv-vat-reason"><td colspan="2">${esc(reason)}</td></tr>`);
    }
  }

  // BT-111: VAT total restated in the accounting currency (BT-6). Cannot be
  // recomputed from lines (unknown exchange rate) — read the caller's echo.
  const acctCur = invoice.vat_accounting_currency_code;
  const acctVat = invoice.totals?.tax_amount_accounting_currency;
  if (acctCur && acctVat != null) {
    rows.push(`<tr class="inv-vat-row"><td>${esc(t("view.taxTotalIn", { cur: acctCur }))}</td><td class="inv-col-num">${curAmt(acctVat, acctCur, lang)}</td></tr>`);
  }

  if (totals.prepaid !== 0) {
    // Sign-faithful: a positive prepaid is subtracted from the total, a
    // negative one (over-refund on a correction) adds to it.
    const sign = totals.prepaid > 0 ? "− " : "+ ";
    rows.push(`<tr><td>${t("view.prepaid")}</td><td class="inv-col-num">${sign}${curAmt(Math.abs(totals.prepaid), cur, lang)}</td></tr>`);
  }
  if (totals.rounding !== 0) {
    const sign = totals.rounding > 0 ? "+ " : "− ";
    rows.push(`<tr><td>${t("view.rounding")}</td><td class="inv-col-num">${sign}${curAmt(Math.abs(totals.rounding), cur, lang)}</td></tr>`);
  }

  rows.push(`<tr class="inv-totals-payable"><td>${t("view.payable")}</td><td class="inv-col-num">${curAmt(totals.payable, cur, lang)}</td></tr>`);

  return `<div class="inv-totals-wrap">
    <table class="inv-totals"><tbody>${rows.join("")}</tbody></table>
  </div>`;
}

// BG-24: additional supporting documents — reference, description, and where
// the document lives (URL or embedded file).
function supportingDocsBlock(invoice, t) {
  const docs = invoice.supporting_documents || [];
  if (docs.length === 0) return "";
  const rows = docs.map(d => {
    const bits = [];
    if (d.reference) bits.push(`<span class="inv-doc-ref">${esc(d.reference)}</span>`);
    if (d.description) bits.push(esc(d.description));
    if (d.attached_document?.filename) bits.push(esc(d.attached_document.filename));
    if (d.external_location) bits.push(`<span class="inv-doc-url">${esc(d.external_location)}</span>`);
    return `<div class="inv-doc">${bits.join(" · ")}</div>`;
  }).join("");
  return `<div class="inv-docs">
    <div class="inv-section-label">${esc(t("view.attachments"))}</div>
    ${rows}
  </div>`;
}

// Resolve the payment means to a human-readable label. Prefer BT-82 free
// text; fall back to a lookup of the BT-81 (UNTDID 4461) code; fall back
// further to the raw code if the lookup misses.
function paymentMeansLabel(p, t) {
  if (p.means_text) return p.means_text;
  if (!p.means_code) return "";
  const key = "paymentMeans." + p.means_code;
  const label = t(key);
  return label === key ? p.means_code : label;
}

function paymentBlock(invoice, t) {
  const p = invoice.payment;
  if (!p) return "";
  const rows = [];

  const means = paymentMeansLabel(p, t);
  if (means) {
    rows.push(`<div><span class="inv-label">${t("view.paymentMeans")}</span> ${esc(means)}</div>`);
  }

  // BG-17 credit transfers (one or more).
  for (const ct of p.credit_transfers || []) {
    if (ct.account_id) {
      rows.push(`<div><span class="inv-label">${t("view.iban")}</span> ${esc(ct.account_id)}</div>`);
    }
    if (ct.service_provider_id) {
      rows.push(`<div><span class="inv-label">${t("view.bic")}</span> ${esc(ct.service_provider_id)}</div>`);
    }
    if (ct.account_name) {
      rows.push(`<div><span class="inv-label">${t("view.accountName")}</span> ${esc(ct.account_name)}</div>`);
    }
  }

  // BG-18 payment card (masked PAN + holder name).
  if (p.card) {
    if (p.card.account_number) {
      rows.push(`<div><span class="inv-label">${t("view.cardNumber")}</span> ${esc(p.card.account_number)}</div>`);
    }
    if (p.card.holder_name) {
      rows.push(`<div><span class="inv-label">${t("view.cardHolder")}</span> ${esc(p.card.holder_name)}</div>`);
    }
  }

  // BG-19 direct debit (mandate reference, creditor ID, debited account).
  const dd = p.direct_debit;
  if (dd) {
    if (dd.mandate_reference) {
      rows.push(`<div><span class="inv-label">${t("view.mandateReference")}</span> ${esc(dd.mandate_reference)}</div>`);
    }
    if (dd.creditor_id) {
      rows.push(`<div><span class="inv-label">${t("view.creditorId")}</span> ${esc(dd.creditor_id)}</div>`);
    }
    if (dd.debited_account_id) {
      rows.push(`<div><span class="inv-label">${t("view.debitedAccount")}</span> ${esc(dd.debited_account_id)}</div>`);
    }
  }

  if (p.remittance_information) {
    rows.push(`<div><span class="inv-label">${t("view.remittance")}</span> ${esc(p.remittance_information)}</div>`);
  }

  if (rows.length === 0) return "";
  return `<div class="inv-payment">
    <div class="inv-section-label">${esc(t("view.paymentInstructions"))}</div>
    ${rows.join("")}
  </div>`;
}

function paymentTermsBlock(invoice, t) {
  if (!invoice.payment_terms) return "";
  return `<div class="inv-payment-terms">
    <span class="inv-label">${t("view.paymentTerms")}</span> ${esc(invoice.payment_terms)}
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
export function renderInvoice(invoice, { t, lang = DEFAULT_LANG }) {
  const totals = computeTotals(invoice);

  return `
    <div class="invoice-paper">
      ${headerBlock(invoice, t, lang)}
      ${partiesBlock(invoice, t)}
      ${referencesBlock(invoice, t)}
      ${periodBlock(invoice, t, lang)}
      ${notesBlock(invoice, t)}
      ${linesBlock(invoice, t, lang)}
      ${totalsBlock(invoice, t, lang, totals)}
      ${supportingDocsBlock(invoice, t)}
      ${paymentBlock(invoice, t)}
      ${paymentTermsBlock(invoice, t)}
    </div>`;
}
