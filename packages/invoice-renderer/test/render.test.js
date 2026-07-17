import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderInvoice,
  renderInvoiceDocument,
  makeT,
  amt,
  curAmt,
  esc,
  num,
  fmtDate,
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

const en = makeT("en");
const de = makeT("de");

test("formatters", () => {
  assert.equal(esc('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  assert.equal(amt("10"), "10.00");
  // amount and currency joined by a U+00A0 no-break space
  assert.match(curAmt("10", "EUR"), /^10\.00.EUR$/);
});

test("formatters: language-determined separators, never the process locale", () => {
  assert.equal(amt(1234.56, "en"), "1,234.56");
  assert.equal(amt(1234.56, "de"), "1.234,56");
  assert.equal(amt(-42, "de"), "−42,00"); // U+2212
  assert.equal(num("2.5", "de"), "2,5");
  assert.equal(num("2.5", "en"), "2.5");
  assert.equal(num("1000", "de"), "1.000");
});

test("formatters: dates localize for German, stay ISO for English", () => {
  assert.equal(fmtDate("2026-07-17", "de"), "17.07.2026");
  assert.equal(fmtDate("2026-07-17", "en"), "2026-07-17");
  assert.equal(fmtDate("not-a-date", "de"), "not-a-date");
});

test("renderInvoice: fragment carries the core content (en)", () => {
  const html = renderInvoice(invoice, { t: en });
  assert.match(html, /class="invoice-paper"/);
  assert.match(html, /Invoice/); // view.invoice
  assert.match(html, /INV-1/);
  assert.match(html, /Widget/);
  assert.match(html, /23\.80.EUR/); // payable: 20.00 net + 19% VAT (U+00A0 before EUR)
});

test("renderInvoice: credit note uses the credit-note label", () => {
  const html = renderInvoice({ ...invoice, invoice_type_code: "381" }, { t: en });
  assert.match(html, /Credit Note/);
});

test("renderInvoice: BT-3 titles resolve through the invoiceTypes codelist", () => {
  const corrected = { ...invoice, invoice_type_code: "384" };
  assert.match(renderInvoice(corrected, { t: en }), /Corrected invoice/);
  assert.match(renderInvoice(corrected, { t: de, lang: "de" }), /Rechnungskorrektur/);
  assert.match(renderInvoice({ ...invoice, invoice_type_code: "383" }, { t: en }), /Debit note/);
  // Unknown code falls back to the friendly default, not the raw code.
  const unknown = renderInvoice({ ...invoice, invoice_type_code: "999" }, { t: en });
  assert.match(unknown, /class="inv-type">Invoice</);
});

test("renderInvoice: German document localizes dates and amounts", () => {
  const html = renderInvoice(
    { ...invoice, due_date: "2026-02-01", lines: [{ ...invoice.lines[0], quantity: "2.5", price: { net_price: "1000" } }] },
    { t: de, lang: "de" },
  );
  assert.match(html, /15\.01\.2026/); // issue date
  assert.match(html, /01\.02\.2026/); // due date
  assert.match(html, /2\.500,00/);    // line total 2.5 × 1000, German separators
  assert.match(html, />2,5 /);        // quantity with decimal comma
});

test("renderInvoice: preceding invoices (BG-3) surface in the header", () => {
  const html = renderInvoice(
    {
      ...invoice,
      invoice_type_code: "384",
      preceding_invoices: [{ reference: "INV-0", issue_date: "2025-12-31" }],
    },
    { t: de, lang: "de" },
  );
  assert.match(html, /inv-preceding/);
  assert.match(html, /Vorherige Rechnung/);
  assert.match(html, /INV-0 \(31\.12\.2025\)/);
});

test("renderInvoice: delivery date and invoicing period render together (BT-72 + BG-14)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      delivery: { date: "2026-01-10", period: { start_date: "2026-01-01", end_date: "2026-01-31" } },
    },
    { t: en },
  );
  assert.match(html, /Invoicing period/);
  assert.match(html, /2026-01-01 – 2026-01-31/);
  assert.match(html, /Delivery date/);
  assert.match(html, /2026-01-10/);
});

test("renderInvoice: non-standard VAT categories are visible (BT-151 + BT-118 + BT-121)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      lines: [{ ...invoice.lines[0], vat: { category_code: "AE", rate: "0" } }],
      vat_breakdown: [{ category_code: "AE", rate: "0", reason: "Reverse charge", reason_code: "VATEX-EU-AE" }],
    },
    { t: en },
  );
  assert.match(html, /inv-line-vatcat">AE</);            // line-level category letter
  assert.match(html, /Reverse charge/);                  // vatCategory codelist label in the breakdown
  assert.match(html, /Reverse charge \(VATEX-EU-AE\)/);  // BT-120 + BT-121 sub-row
});

test("renderInvoice: prepaid sign is faithful (BT-113)", () => {
  const paid = renderInvoice({ ...invoice, prepaid_amount: "23.80" }, { t: en });
  assert.match(paid, /Prepaid<\/td><td class="inv-col-num">− 23\.80/);
  const negative = renderInvoice({ ...invoice, prepaid_amount: "-5.00" }, { t: en });
  assert.match(negative, /Prepaid<\/td><td class="inv-col-num">\+ 5\.00/);
});

test("renderInvoice: VAT accounting currency renders (BT-6 + BT-111)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      currency_code: "SEK",
      vat_accounting_currency_code: "EUR",
      totals: { tax_amount_accounting_currency: "3.42" },
    },
    { t: en },
  );
  assert.match(html, /VAT currency<\/span> EUR/);
  assert.match(html, /VAT total in EUR/);
  assert.match(html, /3\.42.EUR/);
});

test("renderInvoice: supporting documents section (BG-24)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      supporting_documents: [
        { reference: "DOC-7", description: "Timesheet", external_location: "https://example.org/ts.pdf" },
        { reference: "DOC-8", attached_document: { content: "AAAA", mime_code: "application/pdf", filename: "annex.pdf" } },
      ],
    },
    { t: en },
  );
  assert.match(html, /Attachments/);
  assert.match(html, /DOC-7/);
  assert.match(html, /Timesheet/);
  assert.match(html, /https:\/\/example\.org\/ts\.pdf/);
  assert.match(html, /annex\.pdf/);
});

test("renderInvoice: price base quantity qualifies the unit price (BT-149/150)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      lines: [{
        ...invoice.lines[0],
        quantity: "250",
        price: { net_price: "8.00", base_quantity: "100", base_quantity_unit_code: "C62" },
      }],
    },
    { t: en },
  );
  assert.match(html, /inv-line-price-base/);
  assert.match(html, /per 100/);
});

test("renderInvoice: price discount is stated, not just implied (BT-147)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      lines: [{
        ...invoice.lines[0],
        price: { net_price: "100.00", gross_price: "120.00", discount: "20.00" },
      }],
    },
    { t: en },
  );
  assert.match(html, /was 120\.00 \(− 20\.00\)/);
});

test("renderInvoice: party identifiers, electronic addresses and schemes (BT-29/34/46/49)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      seller: {
        ...invoice.seller,
        identifiers: [{ id: "SELLER-1", scheme_id: "0088" }],
        electronic_address: { id: "seller@edi.example", scheme_id: "EM" },
        vat_id: "DE123456789",
        legal_registration_id: { id: "HRB 12345", scheme_id: "0198" },
      },
      buyer: {
        ...invoice.buyer,
        identifier: { id: "BUYER-9" },
        electronic_address: { id: "0204:991-33333-33", scheme_id: "0204" },
      },
    },
    { t: de, lang: "de" },
  );
  assert.match(html, /SELLER-1 \(0088\)/);
  assert.match(html, /seller@edi\.example \(EM\)/);
  assert.match(html, /BUYER-9/);
  assert.match(html, /0204:991-33333-33 \(0204\)/);
  assert.match(html, /HRB 12345 \(0198\)/);
  assert.match(html, /USt-IdNr\./);          // localized, was hardcoded "VAT"
  assert.match(html, /Elektronische Adresse/);
});

test("renderInvoice: item metadata renders (BT-155…BT-161, BG-32)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      lines: [{
        ...invoice.lines[0],
        order_line_reference: "PO-LINE-3",
        object_identifier: { id: "OBJ-1" },
        buyer_accounting_reference: "COST-42",
        item: {
          name: "Widget",
          seller_id: "W-100",
          buyer_id: "B-200",
          standard_id: { id: "4012345678901", scheme_id: "0160" },
          classifications: [{ id: "43211500", scheme_id: "STI", version: "20.0602" }],
          country_of_origin: "DE",
          attributes: [{ name: "Colour", value: "Red" }],
        },
      }],
    },
    { t: en },
  );
  assert.match(html, /Item no\.<\/span> W-100/);
  assert.match(html, /Your item no\.<\/span> B-200/);
  assert.match(html, /4012345678901 \(0160\)/);
  assert.match(html, /43211500 \(STI 20\.0602\)/);
  assert.match(html, /Country of origin<\/span> DE/);
  assert.match(html, /Colour<\/span> Red/);
  assert.match(html, /Order line<\/span> PO-LINE-3/);
  assert.match(html, /Object ID<\/span> OBJ-1/);
  assert.match(html, /Accounting reference<\/span> COST-42/);
});

test("renderInvoice: allowance/charge derivation and reason codes (BT-93/94/98…)", () => {
  const html = renderInvoice(
    {
      ...invoice,
      document_allowances: [{
        amount: "20.00", base_amount: "200.00", percentage: "10",
        vat_category_code: "S", reason: "Volume discount", reason_code: "95",
      }],
      lines: [{
        ...invoice.lines[0],
        charges: [{ amount: "5.00", percentage: "2.5", base_amount: "200.00", reason_code: "FC" }],
      }],
    },
    { t: en },
  );
  assert.match(html, /Volume discount \(95\) \(10 % of 200\.00\)/);
  assert.match(html, /FC \(2\.5 % of 200\.00\)/);
});

test("renderInvoice: note subject codes render as chips (BT-21)", () => {
  const html = renderInvoice(
    { ...invoice, notes: [{ subject_code: "AAI", text: "General information." }] },
    { t: en },
  );
  assert.match(html, /inv-note-code">AAI<\/span> General information\./);
});

test("renderInvoice: tax point date and code (BT-7/BT-8)", () => {
  const withDate = renderInvoice({ ...invoice, tax_point_date: "2026-01-10" }, { t: en });
  assert.match(withDate, /Tax point date<\/span> 2026-01-10/);
  const withCode = renderInvoice({ ...invoice, tax_point_date_code: "35" }, { t: en });
  assert.match(withCode, /Tax point date<\/span> Delivery date/);
});

test("renderInvoice: document-level accounting reference (BT-19)", () => {
  const html = renderInvoice({ ...invoice, buyer_accounting_reference: "K-2026-01" }, { t: en });
  assert.match(html, /Accounting reference<\/span><span class="inv-ref-value">K-2026-01/);
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

test("makeT: resolves the invoiceTypes / vatCategory / taxPointDateCode buckets", () => {
  assert.equal(en("invoiceTypes.384"), "Corrected invoice");
  assert.equal(de("invoiceTypes.384"), "Rechnungskorrektur");
  assert.equal(en("vatCategory.AE"), "Reverse charge");
  assert.equal(en("taxPointDateCode.35"), "Delivery date");
  assert.equal(en("invoiceTypes.999"), "999"); // miss → code, renderer falls back
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
  assert.match(doc, /Zahlbetrag/);   // German payable label
  assert.match(doc, /15\.01\.2026/); // lang reaches the fragment formatters
});

test("renderInvoiceDocument: partial invoice (no seller) still renders", () => {
  const doc = renderInvoiceDocument({ invoice_number: "X", lines: [] }, { lang: "en" });
  assert.match(doc, /^<!DOCTYPE html>/);
  assert.match(doc, /invoice-paper/);
});

test("renderInvoice: codelist lookups degrade to the code with a minimal t", () => {
  // A custom resolver that only knows view.* strings — the contract says it
  // returns the key on a miss. Codelist-backed labels must fall back to the
  // raw code, never leak "vatCategory.AE"-style keys into the document.
  const bundled = makeT("en");
  const minimalT = (key, vars) => (key.startsWith("view.") ? bundled(key, vars) : key);
  const html = renderInvoice(
    {
      ...invoice,
      tax_point_date_code: "35",
      lines: [{ ...invoice.lines[0], vat: { category_code: "AE", rate: "0" } }],
      vat_breakdown: [{ category_code: "AE", rate: "0" }],
    },
    { t: minimalT },
  );
  assert.doesNotMatch(html, /vatCategory\./);
  assert.doesNotMatch(html, /taxPointDateCode\./);
  assert.match(html, /· AE/);   // breakdown shows the bare category code
  assert.match(html, /> 35</);  // tax point code shown raw
});
