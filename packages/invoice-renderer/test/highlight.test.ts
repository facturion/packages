// highlight(): marks on an annotated render, in a DOM (linkedom).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderInvoice, makeT } from "../src/index.js";
import { highlight, type HighlightFinding } from "../src/highlight.js";

const invoice = {
  invoice_number: "INV-1",
  issue_date: "2026-01-15",
  invoice_type_code: "380",
  currency_code: "EUR",
  seller: { name: "Seller GmbH", address: { city: "Berlin", country_code: "DE" }, contact: { name: "Ann", email: "a@example.com" } },
  buyer: { name: "Buyer Ltd", address: { country_code: "FR" } },
  lines: [{ id: "1", quantity: "2", unit_code: "C62", item: { name: "Widget" }, price: { net_price: "10" }, vat: { category_code: "S", rate: "19" }, net_amount: "20" }],
  vat_breakdown: [{ category_code: "S", rate: "19", taxable_amount: "20", tax_amount: "3.80" }],
  totals: { line_net_total: "20", tax_exclusive_amount: "20", tax_amount: "3.81", tax_inclusive_amount: "23.80", amount_due: "23.80" },
};

function page(lang: "en" | "de" = "en") {
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${renderInvoice(invoice, { t: makeT(lang), lang, annotate: true })}</div></body></html>`);
  const root = document.getElementById("root");
  assert.ok(root);
  return { document, root };
}

const findings: HighlightFinding[] = [
  // The seller's phone is missing (error), the buyer reference too (warning).
  { severity: "error", kind: "missing", fields: [{ role: "target", state: "absent", pointer: "/seller/contact/phone" }] },
  { severity: "warning", kind: "missing", fields: [{ role: "target", state: "absent", pointer: "/buyer_reference" }] },
  // The VAT total doesn't match its one row: the total is the target.
  { severity: "error", kind: "inconsistent", fields: [
    { role: "target", state: "present", pointer: "/totals/tax_amount" },
    { role: "operand", state: "present", pointer: "/vat_breakdown/0/tax_amount" },
  ] },
  // A line's category made a rule apply; the fix is a field the invoice never prints.
  { severity: "error", kind: "missing-any", fields: [
    { role: "target", state: "absent", pointer: "/seller/vat_id" },
    { role: "target", state: "absent", pointer: "/specification_identifier" },
    { role: "condition", state: "present", pointer: "/lines/0/vat/category_code" },
  ] },
];

test("rest: missing fields show their slot, labelled and localized", () => {
  const { root } = page("de");
  highlight(root, findings).show();
  const phone = root.querySelector('[data-slot="/seller/contact/phone"]') as HTMLElement;
  assert.equal(phone.hidden, false);
  assert.ok(phone.classList.contains("inv-slot--shown") && phone.classList.contains("inv-hl--error"));
  assert.equal(phone.textContent, "Telefon fehlt");
  const ref = root.querySelector('[data-slot="/buyer_reference"]') as HTMLElement;
  assert.ok(ref.classList.contains("inv-hl--warning"));
  // missing-any: its first field with a place on the invoice.
  assert.equal((root.querySelector('[data-slot="/seller/vat_id"]') as HTMLElement).hidden, false);
});

test("rest: missing-any shows one box per group, the first one the invoice has a place for", () => {
  const { root } = page();
  const slot = (p: string) => root.querySelector(`[data-slot="${p}"]`) as HTMLElement;
  const absent = (pointer: string, group?: string) => ({ role: "target" as const, state: "absent" as const, pointer, ...(group ? { group } : {}) });
  const hl = highlight(root, [
    { severity: "error", kind: "missing-any", fields: [absent("/specification_identifier"), absent("/seller/vat_id"), absent("/buyer_reference")] },
  ]);
  hl.show();
  assert.equal(slot("/seller/vat_id").hidden, false);
  assert.equal(slot("/buyer_reference").hidden, true);
  // Focused, it shows every alternative.
  hl.show(0);
  assert.equal(slot("/buyer_reference").hidden, false);

  highlight(root, [
    { severity: "error", kind: "missing-any", fields: [absent("/seller/vat_id", "a"), absent("/seller/contact/phone", "a"), absent("/buyer_reference", "b")] },
  ]).show();
  assert.equal(slot("/seller/vat_id").hidden, false);
  assert.equal(slot("/seller/contact/phone").hidden, true);
  assert.equal(slot("/buyer_reference").hidden, false);
});

test("rest: the most severe finding owns an element's colour", () => {
  const { root } = page();
  const hl = highlight(root, [
    { severity: "warning", fields: [{ role: "target", state: "present", pointer: "/invoice_number" }] },
    { severity: "error", fields: [{ role: "target", state: "present", pointer: "/invoice_number" }] },
  ]);
  hl.show();
  const el = root.querySelector('[data-path="/invoice_number"]') as HTMLElement;
  assert.ok(el.classList.contains("inv-hl--error") && !el.classList.contains("inv-hl--warning"));
  assert.deepEqual(hl.findingsAt(el), [1, 0]);
});

test("a merged totals row is found by any field it shows", () => {
  const { root } = page();
  highlight(root, findings).show(2);
  // One VAT row shows both the breakdown and (merged, when equal) the total;
  // here they differ, so the total has its own row.
  const total = root.querySelector('[data-path~="/totals/tax_amount"]') as HTMLElement;
  assert.ok(total.classList.contains("inv-hl--focus") && total.classList.contains("inv-hl--target"));
  const operand = root.querySelector('[data-path="/vat_breakdown/0/tax_amount"]') as HTMLElement;
  assert.ok(operand.classList.contains("inv-hl--operand"));
});

test("focus: every role, and fields with no place on the invoice", () => {
  const { root } = page();
  const hl = highlight(root, findings);
  hl.show(3);
  const slot = root.querySelector('[data-slot="/seller/vat_id"]') as HTMLElement;
  assert.equal(slot.hidden, false);
  assert.ok(slot.classList.contains("inv-hl--focus"));
  assert.ok(root.querySelector('[data-path="/lines/0/vat/category_code"]') === null); // S is not printed
  const vat = root.querySelector('[data-path="/lines/0/vat"]') as HTMLElement;
  assert.ok(vat.classList.contains("inv-hl--condition"), "an unprinted field marks its container");
  assert.deepEqual(hl.offInvoice(3).map((f) => f.state !== "add-entry" && f.pointer), ["/specification_identifier"]);
});

test("clear() undoes everything", () => {
  const { root } = page();
  // Attribute order may change (hidden is set again), so compare what matters.
  const state = () => [...root.querySelectorAll("*")].map((el) => `${el.getAttribute("class") ?? ""}|${el.hasAttribute("hidden")}`);
  const before = state();
  const hl = highlight(root, findings);
  hl.show(3);
  assert.notDeepEqual(state(), before);
  hl.clear();
  assert.deepEqual(state(), before);
});
