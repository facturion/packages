// field / setField: codes to values, over the document and the input.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addEntry,
  addEntryIn,
  completeInvoice,
  field,
  fieldIn,
  READ_FIELDS,
  setField,
  setFieldIn,
  WRITE_FIELDS,
  type InvoiceInput,
} from "../src/index.js";
import { minimalValid } from "./fixtures.js";

const input = (): InvoiceInput => structuredClone(minimalValid) as InvoiceInput;

test("a single code reads its value, or undefined", () => {
  const doc = completeInvoice({ ...input(), buyer_reference: "PO-1" });
  assert.equal(field(doc, "BT-10"), "PO-1");
  assert.equal(field(doc, "BT-11"), undefined);
});

test("a code inside a list reads every entry's value, located", () => {
  const inv = input();
  inv.lines.push({ ...inv.lines[0]!, id: "2", item: { name: "Gadget" } });
  assert.deepEqual(field(completeInvoice(inv), "BT-153"), [
    { pointer: "/lines/0/item/name", value: "Widget" },
    { pointer: "/lines/1/item/name", value: "Gadget" },
  ]);
});

test("within an entry, a grouped code reads that entry's value", () => {
  const doc = completeInvoice(input());
  const [line] = field(doc, "BG-25");
  assert.equal(fieldIn(line!.value, "BT-153"), "Widget");
  assert.equal(fieldIn(line!.value, "BT-131"), 20);
  assert.deepEqual(fieldIn(line!.value, "BG-27"), []);
});

test("the document's totals, not the caller's inputs", () => {
  const inv = { ...input(), prepaid_amount: "5" };
  assert.equal(READ_FIELDS["BT-113"].pattern, "/totals/prepaid_amount");
  assert.equal(WRITE_FIELDS["BT-113"].pattern, "/prepaid_amount");
  const doc = completeInvoice(inv);
  assert.equal(field(doc, "BT-113"), 5);
  assert.equal(field(doc, "BT-115"), 18.8);
  assert.equal("BT-112" in WRITE_FIELDS, false);
});

test("a scheme has its own code", () => {
  const doc = completeInvoice({ ...input(), buyer: { ...minimalValid.buyer, electronic_address: { id: "a@b.de", scheme_id: "EM" } } });
  assert.deepEqual(field(doc, "BT-49"), { id: "a@b.de", scheme_id: "EM" });
  assert.equal(field(doc, "BT-49-1"), "EM");
});

test("setField creates the way, and undefined removes what it leaves empty", () => {
  const inv = input();
  setField(inv, "BT-49", { id: "a@b.de", scheme_id: "EM" });
  setField(inv, "BT-113", 5);
  setField(inv, "BT-72", "2026-01-10");
  assert.deepEqual(inv.buyer.electronic_address, { id: "a@b.de", scheme_id: "EM" });
  assert.equal(inv.prepaid_amount, 5);
  assert.deepEqual(inv.delivery, { date: "2026-01-10" });
  setField(inv, "BT-72", undefined);
  assert.equal("delivery" in inv, false);
  setField(inv, "BT-49-1", undefined);
  assert.deepEqual(inv.buyer.electronic_address, { id: "a@b.de" });
});

test("setFieldIn and the entry adders work within an entry", () => {
  const inv = input();
  const line = inv.lines[0]!;
  setFieldIn(line, "BT-153", "Sprocket");
  setFieldIn(line, "BT-134", "2026-01-01");
  assert.equal(line.item.name, "Sprocket");
  assert.deepEqual(line.period, { start_date: "2026-01-01" });
  assert.equal(addEntryIn(line, "BG-27", { amount: "1" }), "/allowances/0");
  assert.equal(addEntry(inv, "BG-25", { ...line, id: "2" }), "/lines/1");
  assert.equal(addEntry(inv, "BT-29", { id: "X", scheme_id: "0088" }), "/seller/identifiers/0");
  assert.equal(inv.lines.length, 2);
});
