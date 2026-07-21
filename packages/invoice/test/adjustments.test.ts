import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertValidInvoice,
  checkAdjustmentDerivations,
  InvoiceValidationError,
  validateInvoice,
  validatePartialInvoice,
} from "../src/index.js";
import { minimalValid } from "./fixtures.js";

/** `minimalValid` plus document-level adjustments. Its single line is
 *  2 × 10.00 = 20.00 at 19%, so a 10% allowance on that base is 2.00. */
const withDocAdjust = (entries: Record<string, unknown>[], key = "document_allowances") => ({
  ...minimalValid,
  [key]: entries,
});

test("consistent percentage adjustment passes", () => {
  const inv = withDocAdjust([
    { amount: "2.00", base_amount: "20.00", percentage: "10", vat_category_code: "S", vat_rate: "19" },
  ]);
  assert.deepEqual(checkAdjustmentDerivations(inv), []);
  assert.equal(validateInvoice(inv), true, JSON.stringify(validateInvoice.errors));
});

test("contradictory percentage adjustment is rejected", () => {
  const inv = withDocAdjust([
    { amount: "50.00", base_amount: "1000.00", percentage: "10", vat_category_code: "S", vat_rate: "19" },
  ]);

  const errors = checkAdjustmentDerivations(inv);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.instancePath, "/document_allowances/0/amount");
  assert.equal(errors[0]?.keyword, "x-derivation");
  assert.equal(errors[0]?.params.derived, 100);

  assert.equal(validateInvoice(inv), false);
  assert.throws(
    () => assertValidInvoice(inv),
    (err: unknown) => {
      assert.ok(err instanceof InvoiceValidationError);
      assert.ok(err.errors?.some((e) => e.keyword === "x-derivation"));
      return true;
    },
  );
});

test("charges are checked too, at document and line level", () => {
  const docCharge = withDocAdjust(
    [{ amount: "5.00", base_amount: "20.00", percentage: "10", vat_category_code: "S", vat_rate: "19" }],
    "document_charges",
  );
  assert.equal(checkAdjustmentDerivations(docCharge).length, 1);

  const lineLevel = {
    ...minimalValid,
    lines: [
      {
        ...minimalValid.lines[0],
        allowances: [{ amount: "9.99", base_amount: "20.00", percentage: "10" }],
        charges: [{ amount: "2.00", base_amount: "20.00", percentage: "5" }],
      },
    ],
  };
  const errors = checkAdjustmentDerivations(lineLevel);
  assert.deepEqual(
    errors.map((e) => e.instancePath),
    ["/lines/0/allowances/0/amount", "/lines/0/charges/0/amount"],
  );
});

test("an entry omitting a derivation field is unconstrained", () => {
  // A flat amount with no percentage claim: nothing to contradict.
  const flat = withDocAdjust([{ amount: "7.34", vat_category_code: "S", vat_rate: "19" }]);
  assert.deepEqual(checkAdjustmentDerivations(flat), []);

  // Percentage without a base: no base to apply it to, so still unconstrained.
  const noBase = withDocAdjust([
    { amount: "7.34", percentage: "10", vat_category_code: "S", vat_rate: "19" },
  ]);
  assert.deepEqual(checkAdjustmentDerivations(noBase), []);
});

test("a cent of rounding-mode disagreement is tolerated, more is not", () => {
  // 100.50 × 1% = 1.005. Half-away-from-zero gives 1.01, half-to-even 1.00;
  // a caller doing either has written a legitimate invoice.
  const halfToEven = withDocAdjust([
    { amount: "1.00", base_amount: "100.50", percentage: "1", vat_category_code: "S", vat_rate: "19" },
  ]);
  assert.deepEqual(checkAdjustmentDerivations(halfToEven), []);

  // Two cents out is not a rounding mode, it is a wrong number.
  const off = withDocAdjust([
    { amount: "1.03", base_amount: "100.50", percentage: "1", vat_category_code: "S", vat_rate: "19" },
  ]);
  assert.equal(checkAdjustmentDerivations(off).length, 1);
});

test("partial mode is exempt — a draft may hold an unrecomputed amount", () => {
  const draft = {
    document_allowances: [{ amount: "2.00", base_amount: "1000.00", percentage: "10" }],
  };
  assert.equal(validatePartialInvoice(draft), true);
});

test("non-invoice input is handled without throwing", () => {
  for (const input of [null, undefined, 42, "nope", [], {}]) {
    assert.deepEqual(checkAdjustmentDerivations(input), []);
  }
});
