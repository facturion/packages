import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, lineNet } from "../src/index.js";

const cents = (n: number): number => Math.round(n * 100) / 100;

test("lineNet: explicit net_amount wins", () => {
  assert.equal(lineNet({ net_amount: "42.50", quantity: "99", price: { net_price: "1" } }), 42.5);
});

test("lineNet: quantity × price", () => {
  assert.equal(lineNet({ quantity: "3", price: { net_price: "5" } }), 15);
});

test("lineNet: base_quantity divides", () => {
  assert.equal(lineNet({ quantity: "10", price: { net_price: "2", base_quantity: "5" } }), 4);
});

test("lineNet: line allowances subtract, charges add", () => {
  assert.equal(
    lineNet({
      quantity: "1",
      price: { net_price: "100" },
      allowances: [{ amount: "10" }],
      charges: [{ amount: "3" }],
    }),
    93,
  );
});

test("computeTotals: golden two-rate invoice with document allowance + charge", () => {
  const invoice = {
    lines: [
      { quantity: "2", price: { net_price: "10.00" }, vat: { category_code: "S", rate: "19" } },
      { quantity: "1", price: { net_price: "100" }, vat: { category_code: "S", rate: "7" } },
    ],
    document_allowances: [{ amount: "5", vat_category_code: "S", vat_rate: "19" }],
    document_charges: [{ amount: "2", vat_category_code: "S", vat_rate: "7" }],
  };

  const t = computeTotals(invoice);
  assert.equal(cents(t.lineExtension), 120);
  assert.equal(cents(t.documentAllowances), 5);
  assert.equal(cents(t.documentCharges), 2);
  assert.equal(cents(t.taxBasis), 117);
  assert.equal(cents(t.taxAmount), 9.99); // 2.85 (19%) + 7.14 (7%)
  assert.equal(cents(t.grandTotal), 126.99);
  assert.equal(cents(t.payable), 126.99);

  // Subtotals sorted by rate descending; reasons attached from vat_breakdown.
  assert.deepEqual(
    t.taxSubtotals.map((s) => [s.rate, cents(s.taxable), cents(s.tax)]),
    [
      [19, 15, 2.85],
      [7, 102, 7.14],
    ],
  );
});

test("computeTotals: prepaid and rounding adjust the payable amount", () => {
  const invoice = {
    lines: [{ quantity: "1", price: { net_price: "100" }, vat: { category_code: "S", rate: "0" } }],
    prepaid_amount: "30",
    rounding_amount: "0.01",
  };
  const t = computeTotals(invoice);
  assert.equal(cents(t.grandTotal), 100);
  assert.equal(cents(t.payable), 70.01); // 100 − 30 prepaid + 0.01 rounding
});

test("computeTotals: vat_breakdown reason is attached to the matching subtotal", () => {
  const invoice = {
    lines: [{ quantity: "1", price: { net_price: "50" }, vat: { category_code: "E", rate: "0" } }],
    vat_breakdown: [{ category_code: "E", rate: "0", reason: "Exempt", reason_code: "VATEX-EU-O" }],
  };
  const [sub] = computeTotals(invoice).taxSubtotals;
  assert.equal(sub?.reason, "Exempt");
  assert.equal(sub?.reason_code, "VATEX-EU-O");
});
