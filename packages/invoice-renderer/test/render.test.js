import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderInvoice,
  renderInvoiceDocument,
  makeT,
  amt,
  curAmt,
  esc,
} from "../src/index.js";

const invoice = {
  invoice_number: "INV-1",
  issue_date: "2026-01-15",
  invoice_type_code: "380",
  currency_code: "EUR",
  seller: { name: "Seller GmbH", address: { country_code: "DE" } },
  buyer: { name: "Buyer Ltd", address: { country_code: "FR" } },
  lines: [
    {
      id: "1",
      quantity: "2",
      unit_code: "C62",
      item: { name: "Widget" },
      price: { net_price: "10.00" },
      vat: { category_code: "S", rate: "19" },
    },
  ],
  payment: { means_code: "30" },
};

test("formatters", () => {
  assert.equal(esc('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  assert.equal(amt("10"), "10.00");
  // amount and currency joined by a U+00A0 no-break space
  assert.match(curAmt("10", "EUR"), /^10\.00.EUR$/);
});

test("renderInvoice: fragment carries the core content (en)", () => {
  const html = renderInvoice(invoice, { t: makeT("en") });
  assert.match(html, /class="invoice-paper"/);
  assert.match(html, /Invoice/); // view.invoice
  assert.match(html, /INV-1/);
  assert.match(html, /Widget/);
  assert.match(html, /23\.80.EUR/); // payable: 20.00 net + 19% VAT (U+00A0 before EUR)
});

test("renderInvoice: credit note uses the credit-note label", () => {
  const html = renderInvoice({ ...invoice, invoice_type_code: "381" }, { t: makeT("en") });
  assert.match(html, /Credit Note/);
});

test("makeT: resolves view, units (codelists), and payment means (codelists)", () => {
  const tEn = makeT("en");
  assert.equal(tEn("view.payable"), "Amount due");
  // Note the typographic narrow no-break space (U+202F) before the percent sign.
  assert.match(tEn("view.taxTotal", { rate: 19 }), /^VAT 19.%$/);
  assert.notEqual(tEn("units.C62"), "units.C62"); // resolved via codelists
  assert.notEqual(tEn("paymentMeans.30"), "paymentMeans.30");
  assert.equal(tEn("view.nope"), "view.nope"); // miss → key
});

test("makeT: German document strings", () => {
  const tDe = makeT("de");
  assert.equal(tDe("view.payable"), "Zahlbetrag");
  assert.equal(tDe("view.invoice"), "Rechnung");
});

test("renderInvoiceDocument: standalone HTML with inlined styles", () => {
  const doc = renderInvoiceDocument(invoice, { lang: "de" });
  assert.match(doc, /^<!DOCTYPE html>/);
  assert.match(doc, /<html lang="de">/);
  assert.match(doc, /<style>/);
  assert.match(doc, /invoice-paper/);
  assert.match(doc, /Zahlbetrag/); // German payable label
});

test("renderInvoiceDocument: partial invoice (no seller) still renders", () => {
  const doc = renderInvoiceDocument({ invoice_number: "X", lines: [] }, { lang: "en" });
  assert.match(doc, /^<!DOCTYPE html>/);
  assert.match(doc, /invoice-paper/);
});
