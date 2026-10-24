// Compile-time checks of the field accessors' types (`npm test` runs tsc on
// this file; nothing here executes). Each @ts-expect-error marks a misuse the
// types must reject.
import { field, fieldIn, setField, setFieldIn, addEntry, completeInvoice, type Invoice, type InvoiceInput } from "../src/index.js";

declare const doc: Invoice;
declare const input: InvoiceInput;

// A single code is its value; an object code is the object.
const ref: string | undefined = field(doc, "BT-10");
const ea: { id: string; scheme_id: string } | undefined = field(doc, "BT-49");
// A code inside a list is located values.
const names: { pointer: string; value: string }[] = field(doc, "BT-153");
// @ts-expect-error: one value per line, not one value
const name: string | undefined = field(doc, "BT-153");

// Within an entry: only that entry's type, and only its group's codes.
const line = field(doc, "BG-25")[0]!.value;
const itemName: string | undefined = fieldIn(line, "BT-153");
// @ts-expect-error: BT-136 belongs to an allowance, not to a line
fieldIn(line, "BT-136");
// @ts-expect-error: a seller isn't a line
fieldIn(doc.seller, "BT-153");

// Reading takes a document; an input becomes one through completeInvoice.
// @ts-expect-error
field(input, "BT-10");
field(completeInvoice(input), "BT-115");

// Writing takes an input; computed codes aren't settable.
setField(input, "BT-10", "PO-1");
setField(input, "BT-113", "5");
// @ts-expect-error: BT-112 is computed
setField(input, "BT-112", "1");
// @ts-expect-error: an object code is set whole
setField(input, "BT-49", { id: "a@b.de" });
// @ts-expect-error: one line's name needs the line
setField(input, "BT-153", "x");
setFieldIn(input.lines[0]!, "BT-153", "x");
addEntry(input, "BG-25", input.lines[0]!);
// @ts-expect-error: a line's allowances are added within the line
addEntry(input, "BG-27", { amount: "1" });

void [ref, ea, names, name, itemName];
