// fieldsFor semantics, on small documents.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pointer } from "@facturion/pointer-patterns";
import { fieldsFor, loadTable, TableError } from "../src/index.js";

const table = loadTable({
  rules: {
    // A transfer's IBAN, or the card when the card block fired (anchored).
    "IBAN": { kind: "invalid", fields: [
      { path: "/payment/credit_transfers/~./account_id", role: "target", anchored: true },
      { path: "/payment/card", role: "target", anchored: true },
    ] },
    // An attribute named cva on every line with category code S.
    "CVA": { kind: "missing", fields: [
      { path: "/lines/~./item/attributes/~?name=cva", role: "target" },
      { path: "/lines/~./vat/category_code", role: "condition" },
      { path: "/document_allowances/~?vat_category_code=S/amount", role: "condition" },
    ] },
    "TAXID": { kind: "missing-any", fields: [
      { path: "/seller/vat_id", role: "target", group: "seller" },
      { path: "/seller/tax_registration_id", role: "target", group: "seller" },
    ] },
    "SUM": { kind: "inconsistent", fields: [
      { path: "/totals/tax_amount", role: "target" },
      { path: "/vat_breakdown/~*/tax_amount", role: "operand" },
    ], syntax: { ubl: { kind: "structural" } } },
    "EXT": { kind: "unrepresentable", fields: [] },
  },
});

const doc = {
  seller: { vat_id: "" },
  lines: [{ item: { attributes: [{ name: "colour" }] }, vat: { category_code: "S" } }, { item: {}, vat: { category_code: "S" } }],
  payment: { credit_transfers: [{ account_id: "DE02" }, { account_id: "XX" }], card: { account_number: "1234" } },
  vat_breakdown: [{ tax_amount: 19 }, { tax_amount: 7 }],
  totals: { tax_amount: 27 },
};

test("anchored targets keep only the anchor's branch", () => {
  const transfer = fieldsFor({ code: "IBAN", anchor: pointer("/payment/credit_transfers/1") }, table, doc, "cii");
  assert.deepEqual(transfer.fields, [{ role: "target", state: "present", pointer: "/payment/credit_transfers/1/account_id" }]);
  const card = fieldsFor({ code: "IBAN", anchor: pointer("/payment/card") }, table, doc, "cii");
  assert.deepEqual(card.fields, [{ role: "target", state: "present", pointer: "/payment/card" }]);
});

test("an unmatched filter is a place to add an entry, for targets only", () => {
  const f = fieldsFor({ code: "CVA", anchor: pointer("/lines/0/vat") }, table, doc, "cii");
  assert.deepEqual(f.fields, [
    { role: "target", state: "add-entry", list: "/lines/0/item/attributes", member: ["name"], value: "cva" },
    { role: "condition", state: "present", pointer: "/lines/0/vat/category_code" },
  ]);
});

test("groups stay on their fields; an empty string is absent", () => {
  const f = fieldsFor({ code: "TAXID" }, table, doc, "ubl");
  assert.deepEqual(f.fields, [
    { role: "target", group: "seller", state: "absent", pointer: "/seller/vat_id" },
    { role: "target", group: "seller", state: "absent", pointer: "/seller/tax_registration_id" },
  ]);
});

test("a syntax variant overrides what it states and inherits the rest", () => {
  const ubl = fieldsFor({ code: "SUM" }, table, doc, "ubl");
  const cii = fieldsFor({ code: "SUM" }, table, doc, "cii");
  assert.equal(ubl.mapping === "table" && ubl.kind, "structural");
  assert.equal(cii.mapping === "table" && cii.kind, "inconsistent");
  assert.deepEqual(ubl.fields, cii.fields);
  assert.equal(cii.fields.length, 3);
});

test("no entry: the anchor alone; no anchor or the root: nothing", () => {
  assert.deepEqual(fieldsFor({ code: "NONE", anchor: pointer("/seller/vat_id") }, table, doc, "ubl"),
    { mapping: "location", fields: [{ role: "target", state: "absent", pointer: "/seller/vat_id" }] });
  assert.deepEqual(fieldsFor({ code: "NONE", anchor: pointer("") }, table, doc, "ubl"), { mapping: "none", fields: [] });
  assert.deepEqual(fieldsFor({ code: "NONE" }, table, doc, "ubl"), { mapping: "none", fields: [] });
});

test("an unrepresentable rule names no fields", () => {
  assert.deepEqual(fieldsFor({ code: "EXT", anchor: pointer("/lines/0") }, table, doc, "cii"), { mapping: "table", kind: "unrepresentable", fields: [] });
});

test("loadTable rejects what the format forbids, listing every problem", () => {
  const bad = {
    rules: {
      A: { kind: "missing", fields: [{ path: "/a", role: "condition", group: "g" }] },
      B: { kind: "invalid", fields: [{ path: "0/a", role: "target", anchored: true }] },
      C: { kind: "unrepresentable", fields: [{ path: "/a", role: "target" }] },
      D: { kind: "missing", fields: [] },
      E: { kind: "wrong", fields: [{ path: "/a", role: "target" }] },
      F: { kind: "invalid", fields: [{ path: "/a/~?", role: "target" }] },
      G: { kind: "invalid", fields: [{ path: "/a", role: "fix" }] },
      H: { kind: "invalid", fields: [{ path: "/a", role: "target" }], nots: "typo" },
      I: { kind: "invalid", fields: [{ path: "/a", role: "target" }], syntax: { xml: {} } },
    },
  };
  assert.throws(() => loadTable(bad), (e: unknown) => {
    assert.ok(e instanceof TableError);
    assert.deepEqual(e.problems.map((p) => p.split(":")[0]).sort(), ["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    return true;
  });
});
