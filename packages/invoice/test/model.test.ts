import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, lineNet, round2 } from "../src/index.js";

// NB: there used to be a `cents()` helper here, and every total was asserted
// through it. It rounded the results before comparing, which is exactly the
// thing the code under test was failing to do — so the helper laundered the
// defect it should have caught, and every fixture happened to use figures that
// round exactly (19% of 15 is 2.85 on the nose). Assert the raw output.

test("round2: strips binary representation noise before deciding", () => {
  // 1.005 is stored as 1.0049999999999998934, so Math.round(1.005 * 100) is
  // 100 and a naive implementation yields 1.00.
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(0.1 + 0.2), 0.3);
});

test("round2: ties go away from zero, not toward +Infinity", () => {
  // Math.round(-0.5) is -0. Credit notes and allowances are negative Amounts
  // and must round like positive ones.
  assert.equal(round2(-1.005), -1.01);
  assert.equal(round2(-0.005), -0.01);
});

test("round2: never yields a negative zero", () => {
  assert.ok(Object.is(round2(-0.001), 0), "-0 would render as a signed zero");
  assert.ok(Object.is(round2(-0), 0));
});

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

test("lineNet: an unlimited-precision price becomes a 2dp Amount", () => {
  // BT-146 (UnitPriceAmount) and BT-129 (Quantity) are unlimited precision;
  // BT-131, their product, is an Amount. 3 × €0.333 is €1.00, not €0.999.
  assert.equal(lineNet({ quantity: "3", price: { net_price: "0.333" } }), 1);
  assert.equal(lineNet({ quantity: "7", price: { net_price: "1.111" } }), 7.78);
});

test("lineNet: rounds once at the end, not per term", () => {
  // EN 16931: BT-131 = ((BT-129 ÷ BT-149) × BT-146) − Σ BT-136 + Σ BT-141.
  // The *result* is the Amount; rounding the product first would give 1.00 − 0.5
  // = 0.50 instead of 0.999 − 0.5 = 0.50. Same here, but the ordering is the
  // standard's and worth pinning.
  assert.equal(
    lineNet({ quantity: "3", price: { net_price: "0.333" }, allowances: [{ amount: "0.5" }] }),
    0.5,
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
  assert.equal(t.lineExtension, 120);
  assert.equal(t.documentAllowances, 5);
  assert.equal(t.documentCharges, 2);
  assert.equal(t.taxBasis, 117);
  assert.equal(t.taxAmount, 9.99); // 2.85 (19%) + 7.14 (7%)
  assert.equal(t.grandTotal, 126.99);
  assert.equal(t.payable, 126.99);

  // Subtotals sorted by rate descending; reasons attached from vat_breakdown.
  assert.deepEqual(
    t.taxSubtotals.map((s) => [s.rate, s.taxable, s.tax]),
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
  assert.equal(t.grandTotal, 100);
  assert.equal(t.payable, 70.01); // 100 − 30 prepaid + 0.01 rounding
});

test("computeTotals: a fully prepaid invoice owes exactly zero", () => {
  // The regression. Facturion's own correction invoice IJBHIXND-0009-K1: a
  // €0.45 line at 19%, already paid in full at €0.54.
  //
  // BT-117 unrounded is 0.45 × 19% = 0.0855, so grandTotal came out 0.5355 and
  // payable 0.5355 − 0.54 = −0.0045, which `toFixed(2)` renders as "-0.00 EUR".
  // A tax correction telling a customer they are owed minus nothing.
  //
  // Invisible without BT-113: with no prepaid amount, payable is 0.5355 and
  // displays as "0.54", so the error had been there the whole time and only
  // subtracting a prepaid amount exposed it.
  const invoice = {
    lines: [{ quantity: "1", price: { net_price: "0.45" }, vat: { category_code: "S", rate: "19" } }],
    prepaid_amount: "0.54",
  };
  const t = computeTotals(invoice);
  assert.equal(t.taxSubtotals[0]?.tax, 0.09, "BT-117 must be a 2dp Amount");
  assert.equal(t.grandTotal, 0.54);
  assert.equal(t.payable, 0);
  assert.ok(Object.is(t.payable, 0), "must not be a negative zero");
});

test("computeTotals: totals reconcile — basis + VAT equals the grand total", () => {
  // The property that actually matters to a reader: the printed subtotal plus
  // the printed VAT must equal the printed total. Unrounded intermediates break
  // this silently, because each figure is rounded independently for display.
  const invoice = {
    lines: [
      { quantity: "3", price: { net_price: "0.333" }, vat: { category_code: "S", rate: "19" } },
      { quantity: "7", price: { net_price: "1.111" }, vat: { category_code: "S", rate: "7" } },
      { quantity: "1", price: { net_price: "12.345" }, vat: { category_code: "S", rate: "19" } },
    ],
  };
  const t = computeTotals(invoice);
  assert.equal(round2(t.taxBasis + t.taxAmount), t.grandTotal);
  assert.equal(
    round2(t.taxSubtotals.reduce((s, g) => s + g.tax, 0)),
    t.taxAmount,
    "BT-110 must equal the sum of the BT-117s a reader can see",
  );
  assert.equal(
    round2(t.taxSubtotals.reduce((s, g) => s + g.taxable, 0)),
    t.taxBasis,
    "BT-109 must equal the sum of the BT-116s a reader can see",
  );
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
