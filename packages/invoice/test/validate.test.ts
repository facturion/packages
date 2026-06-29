import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPartialInvoice,
  assertValidInvoice,
  InvoiceValidationError,
  validateInvoice,
  validatePartialInvoice,
} from "../src/index.js";
import { minimalValid } from "./fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fullInvoice = JSON.parse(readFileSync(join(HERE, "fixtures", "full-invoice.json"), "utf8"));

test("strict: the minimal-required invoice passes", () => {
  assert.equal(validateInvoice(minimalValid), true);
  assert.doesNotThrow(() => assertValidInvoice(minimalValid));
});

test("strict: the full example fixture passes", () => {
  assert.equal(validateInvoice(fullInvoice), true, JSON.stringify(validateInvoice.errors));
});

test("strict: a missing required field is rejected", () => {
  const { invoice_number: _omit, ...noNumber } = minimalValid;
  assert.equal(validateInvoice(noNumber), false);
  assert.throws(
    () => assertValidInvoice(noNumber),
    (err: unknown) => {
      assert.ok(err instanceof InvoiceValidationError);
      assert.ok(Array.isArray(err.errors) && err.errors.length > 0);
      return true;
    },
  );
});

test("partial: an invoice missing required fields is accepted", () => {
  // Just a couple of fields — nothing the strict schema would let pass.
  const draft = { currency_code: "EUR", lines: [{ item: { name: "Draft item" } }] };
  assert.equal(validateInvoice(draft), false, "should fail strict");
  assert.equal(validatePartialInvoice(draft), true, "should pass partial");
  assert.doesNotThrow(() => assertPartialInvoice(draft));
});

test("partial: still enforces types / patterns / enums", () => {
  // currency_code has a pattern; a wrong-shaped value must still be rejected
  // even though nothing is required in partial mode.
  const bad = { currency_code: 123 };
  assert.equal(validatePartialInvoice(bad), false);
  assert.throws(() => assertPartialInvoice(bad), InvoiceValidationError);
});

test("partial: date format is enforced (ajv-formats wired)", () => {
  assert.equal(validatePartialInvoice({ issue_date: "not-a-date" }), false);
  assert.equal(validatePartialInvoice({ issue_date: "2026-01-15" }), true);
});
