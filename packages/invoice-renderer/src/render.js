// Render a "normal invoice" HTML fragment — the way a buyer, seller or
// auditor would expect a commercial document to look. Input: the simplified
// EN 16931 JSON modelled by @facturion/invoice.
//
// Sections are conditional: blocks with no data render nothing, so a bare
// invoice stays compact while a fully-specified one surfaces every field a
// traditional invoice document would carry.
//
// `t(key, vars?)` is injected — a label resolver for `view.*` document strings
// and `units.*` / `paymentMeans.*` vocabulary. `renderInvoiceDocument` supplies
// a default `t` (bundled strings + @facturion/codelists); advanced callers pass
// their own. The net/total math comes from @facturion/invoice.
import { computeTotals, lineNet } from "@facturion/invoice";

export { computeTotals, lineNet };

// Shared formatting helpers.
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function amt(value) {
  const n = Number(value);
  if (!isFinite(n)) return esc(value ?? "—");
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function curAmt(value, cur) {
  // U+00A0 (no-break space) keeps the amount and its currency on one line.
  return cur ? `${amt(value)} ${esc(cur)}` : amt(value);
}

function unitLabel(code, qty, t) {
  if (!code) return "";
  const plural = Number(qty) !== 1;
  const key = "units." + code + (plural ? "_plural" : "");
  const label = t(key);
  return label === key ? code : label;
}

function dateRange(start, end) {
  if (start && end && start !== end) return `${esc(start)} – ${esc(end)}`;
  return esc(start || end || "");
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

// ── Section builders ──────────────────────────────────────────────────────

function headerBlock(invoice, t) {
  const typeLabel = invoice.invoice_type_code === "381"
    ? t("view.creditNote")
    : t("view.invoice");

  return `
    <div class="inv-header">
      <div class="inv-header-left">
        <div class="inv-type">${esc(typeLabel)}</div>
        <div class="inv-id">${esc(invoice.invoice_number)}</div>
      </div>
      <div class="inv-header-right">
        <div><span class="inv-label">${t("view.issueDate")}</span> ${esc(invoice.issue_date)}</div>
        ${invoice.due_date      ? `<div><span class="inv-label">${t("view.dueDate")}</span> ${esc(invoice.due_date)}</div>` : ""}
        ${invoice.currency_code ? `<div><span class="inv-label">${t("view.currency")}</span> ${esc(invoice.currency_code)}</div>` : ""}
      </div>
    </div>`;
}

function partyBlock(party, label, extraLines) {
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
  if (party.vat_id) {
    rows.push(`<div><span class="inv-label">VAT</span> ${esc(party.vat_id)}</div>`);
  }
  if (party.tax_registration_id) {
    rows.push(`<div><span class="inv-label">Tax-ID</span> ${esc(party.tax_registration_id)}</div>`);
  }
  if (party.legal_registration_id?.id) {
    rows.push(`<div><span class="inv-label">Reg</span> ${esc(party.legal_registration_id.id)}</div>`);
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
      ${partyBlock(invoice.seller, t("view.from"))}
      ${partyBlock(invoice.buyer,  t("view.to"),  buyerExtras)}
    </div>`;

  // Secondary parties only appear when present (payee, tax rep, deliver-to).
  const secondaries = [];

  if (invoice.payee) {
    secondaries.push(partyBlock(invoice.payee, t("view.payee")));
  }
  if (invoice.seller_tax_representative) {
    secondaries.push(partyBlock(invoice.seller_tax_representative, t("view.taxRep")));
  }
  const d = invoice.delivery;
  if (d && (d.name || d.address?.line1 || d.location_id?.id)) {
    const extras = [];
    if (d.location_id?.id) {
      extras.push(`<div><span class="inv-label">ID</span> ${esc(d.location_id.id)}</div>`);
    }
    secondaries.push(partyBlock(
      { name: d.name, address: d.address },
      t("view.deliverTo"),
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
  push(t("view.objectIdentifier"), invoice.object_identifier?.id);
  for (const p of invoice.preceding_invoices || []) {
    const val = p.issue_date ? `${p.reference} (${p.issue_date})` : p.reference;
    push(t("view.preceding"), val);
  }

  if (refs.length === 0) return "";
  const rows = refs.map(([k, v]) =>
    `<div class="inv-ref"><span class="inv-ref-label">${esc(k)}</span><span class="inv-ref-value">${esc(v)}</span></div>`
  ).join("");
  return `<div class="inv-references">${rows}</div>`;
}

function periodBlock(invoice, t) {
  const period = invoice.delivery?.period;
  if (period?.start_date || period?.end_date) {
    return `<div class="inv-period">
      <span class="inv-label">${t("view.invoicingPeriod")}</span>
      ${dateRange(period.start_date, period.end_date)}
    </div>`;
  }
  if (invoice.delivery?.date) {
    return `<div class="inv-period">
      <span class="inv-label">${t("view.deliveryDate")}</span>
      ${esc(invoice.delivery.date)}
    </div>`;
  }
  return "";
}

function notesBlock(invoice, t) {
  const notes = invoice.notes || [];
  if (notes.length === 0) return "";
  const items = notes.map(n => `<p>${esc(n.text)}</p>`).join("");
  return `<div class="inv-notes">
    <div class="inv-section-label">${esc(t("view.notes"))}</div>
    ${items}
  </div>`;
}

function linesBlock(invoice, t) {
  const lines = invoice.lines || [];
  const rows = lines.map(line => {
    const qty       = line.quantity;
    const unit      = line.unit_code;
    const netPrice  = line.price?.net_price;
    const grossPrice = line.price?.gross_price;
    const discount  = line.price?.discount;
    const taxRate   = line.vat?.rate;
    const total     = lineNet(line);
    const name      = line.item?.name || "";
    const desc      = line.item?.description && line.item.description !== name
      ? line.item.description : "";

    const periodHtml = (line.period?.start_date || line.period?.end_date)
      ? `<div class="inv-line-meta"><span class="inv-label">${t("view.linePeriod")}</span> ${dateRange(line.period.start_date, line.period.end_date)}</div>`
      : "";
    const noteHtml = line.note ? `<div class="inv-line-meta">${esc(line.note)}</div>` : "";

    // Line-level allowances and charges: shown inline under the description.
    const acBits = [];
    for (const a of line.allowances || []) {
      const label = a.reason || t("view.documentAllowance");
      acBits.push(`<div class="inv-line-allowance">− ${amt(a.amount)} · ${esc(label)}</div>`);
    }
    for (const c of line.charges || []) {
      const label = c.reason || t("view.documentCharge");
      acBits.push(`<div class="inv-line-charge">+ ${amt(c.amount)} · ${esc(label)}</div>`);
    }

    // Show gross + discount alongside the net price when the invoice carries
    // both (e.g. "100.00 / was 120.00 (-16.67%)").
    const priceCell = (grossPrice != null && (discount != null || grossPrice !== netPrice))
      ? `${amt(netPrice)}<div class="inv-line-price-gross">${amt(grossPrice)}</div>`
      : amt(netPrice);

    return `
    <tr>
      <td class="inv-col-id">${esc(line.id)}</td>
      <td class="inv-col-desc">
        <div class="inv-line-name">${esc(name)}</div>
        ${desc       ? `<div class="inv-line-desc">${esc(desc)}</div>` : ""}
        ${periodHtml}
        ${noteHtml}
        ${acBits.join("")}
      </td>
      <td class="inv-col-num">${esc(qty)}${unit ? ` ${esc(unitLabel(unit, qty, t))}` : ""}</td>
      <td class="inv-col-num">${priceCell}</td>
      <td class="inv-col-num">${taxRate != null ? `${esc(taxRate)} %` : ""}</td>
      <td class="inv-col-num">${amt(total)}</td>
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

function totalsBlock(invoice, t, totals) {
  const cur = invoice.currency_code;
  const rows = [];

  rows.push(`<tr><td>${t("view.subtotal")}</td><td class="inv-col-num">${curAmt(totals.lineExtension, cur)}</td></tr>`);

  for (const a of invoice.document_allowances || []) {
    const label = a.reason || t("view.documentAllowance");
    rows.push(`<tr><td>${esc(label)}</td><td class="inv-col-num">− ${curAmt(a.amount, cur)}</td></tr>`);
  }
  for (const c of invoice.document_charges || []) {
    const label = c.reason || t("view.documentCharge");
    rows.push(`<tr><td>${esc(label)}</td><td class="inv-col-num">+ ${curAmt(c.amount, cur)}</td></tr>`);
  }

  // Per-category VAT breakdown — rate, taxable base inline, then tax amount.
  // Exemption reason (BT-120) renders as a subtle sub-row so readers see the
  // compliance statement right next to the 0% line.
  for (const g of totals.taxSubtotals) {
    const rateLabel = t("view.taxTotal", { rate: g.rate });
    rows.push(`<tr class="inv-vat-row">
      <td>${esc(rateLabel)}<span class="inv-vat-base"> · ${t("view.taxableAmount")} ${curAmt(g.taxable, cur)}</span></td>
      <td class="inv-col-num">${curAmt(g.tax, cur)}</td>
    </tr>`);
    if (g.reason) {
      rows.push(`<tr class="inv-vat-reason"><td colspan="2">${esc(g.reason)}</td></tr>`);
    }
  }

  if (totals.prepaid !== 0) {
    rows.push(`<tr><td>${t("view.prepaid")}</td><td class="inv-col-num">− ${curAmt(Math.abs(totals.prepaid), cur)}</td></tr>`);
  }
  if (totals.rounding !== 0) {
    const sign = totals.rounding > 0 ? "+ " : "− ";
    rows.push(`<tr><td>${t("view.rounding")}</td><td class="inv-col-num">${sign}${curAmt(Math.abs(totals.rounding), cur)}</td></tr>`);
  }

  rows.push(`<tr class="inv-totals-payable"><td>${t("view.payable")}</td><td class="inv-col-num">${curAmt(totals.payable, cur)}</td></tr>`);

  return `<div class="inv-totals-wrap">
    <table class="inv-totals"><tbody>${rows.join("")}</tbody></table>
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
 * miss. See `renderInvoiceDocument` for a batteries-included wrapper.
 */
export function renderInvoice(invoice, { t }) {
  const totals = computeTotals(invoice);

  return `
    <div class="invoice-paper">
      ${headerBlock(invoice, t)}
      ${partiesBlock(invoice, t)}
      ${referencesBlock(invoice, t)}
      ${periodBlock(invoice, t)}
      ${notesBlock(invoice, t)}
      ${linesBlock(invoice, t)}
      ${totalsBlock(invoice, t, totals)}
      ${paymentBlock(invoice, t)}
      ${paymentTermsBlock(invoice, t)}
    </div>`;
}
