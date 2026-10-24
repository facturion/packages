# @facturion/invoice

The Facturion **simplified-JSON invoice data model** — a small, friendly JSON
shape that covers the full [EN 16931](https://en.wikipedia.org/wiki/EN_16931)
semantic model, with validation and the canonical money math.

It ships:

- **The JSON Schema** (`data/invoice-schema.json`) — the canonical,
  language-neutral contract. Also exported as a runtime object.
- **Validators** — strict (every field required) and partial (nothing required;
  types, patterns and enums still enforced), built on Ajv with date-format
  checking. Strict mode also runs the cross-field checks JSON Schema can't
  express — see [Allowances and charges](#allowances-and-charges).
- **Derived TypeScript types** — generated from the schema, one per
  direction: `InvoiceInput` (what you write) and `Invoice` (the document).
- **Fields by code** — `field(doc, "BT-10")` and `setField(input, "BT-10", …)`,
  typed per code, from maps generated from the schema.
- **Money math** — `lineNet` and `computeTotals` (the net/VAT/totals chain down
  to the payable amount), and `completeInvoice`, which turns a draft into the
  invoice it becomes once issued. Pure arithmetic, no presentation.

It owns no rendering or i18n. The HTML renderer
(`@facturion/invoice-renderer`) and friendly code-list labels
(`@facturion/codelists`) build on top.

## Install

```sh
npm install @facturion/invoice
```

## Usage

```ts
import {
  assertValidInvoice,
  validatePartialInvoice,
  computeTotals,
  invoiceSchema,
  type InvoiceInput,
} from "@facturion/invoice";

const invoice: InvoiceInput = JSON.parse(input);

// Strict gate for data you're about to process (throws InvoiceValidationError):
assertValidInvoice(invoice);

// Relaxed check for a draft/preview (types enforced, nothing mandatory):
if (!validatePartialInvoice(draft)) {
  // validatePartialInvoice.errors holds the Ajv error list
}

// Totals: line extension → tax basis → VAT → grand total → payable.
const { taxAmount, payable, taxSubtotals } = computeTotals(invoice);
```

## Drafts and issued invoices

The derived parts of an invoice (`lines[].net_amount`, the amounts in
`vat_breakdown`, and `totals`) are outputs. On input the transformation layer
computes them and ignores `totals`; on extraction they are read from the XML as
stated. So a draft has none of them, and an extracted invoice states them,
right or wrong.

`completeInvoice(draft)` fills them in exactly as the XML writers do, giving
the same shape extraction returns:

```ts
import { completeInvoice } from "@facturion/invoice";

const issued = completeInvoice(draft);
issued.totals.amount_due;          // BT-115
issued.vat_breakdown;              // every (category, rate) group, first-seen order,
                                   // exemption reasons taken from the draft's entries
issued.lines[0].net_amount;        // a stated net_amount is kept
```

Use it wherever a draft is shown as a document (previews, PDFs from
`/create`-style input). Don't use it on an extracted invoice: that would replace
what the document says with what it should have said.

The raw schema is available for tooling at `@facturion/invoice/invoice-schema.json`.

### Input and document

The schema describes both directions. Fields only a document states (BG-22
`totals`, the VAT breakdown's amounts) are `readOnly`; fields only a caller
supplies are `writeOnly`: the top-level `prepaid_amount` (BT-113),
`rounding_amount` (BT-114) and `tax_amount_accounting_currency` (BT-111), which
the document states under `totals`. The types follow:

- `InvoiceInput`: what the schema accepts, without the `readOnly` fields.
- `Invoice`: the EN 16931 document, without the `writeOnly` fields, and with
  what a document must state (totals, the VAT breakdown, line net amounts)
  required. `completeInvoice(input)` returns one; so does a parser.

## Fields by code

Every EN 16931 business term (BT) and group (BG) in the model, by its code:

```ts
import { completeInvoice, field, fieldIn, setField, setFieldIn, addEntry } from "@facturion/invoice";

const doc = completeInvoice(draft);
field(doc, "BT-10");            // string | undefined
field(doc, "BT-49");            // { id, scheme_id } | undefined
field(doc, "BT-49-1");          // the scheme alone
field(doc, "BT-113");           // /totals/prepaid_amount: the document's, never the input's
field(doc, "BT-153");           // [{ pointer: "/lines/0/item/name", value }, …]: one per line

for (const { value: line } of field(doc, "BG-25"))
  fieldIn(line, "BT-153");      // that line's: string | undefined

setField(draft, "BT-10", "PO-42");
setField(draft, "BT-49", { id: "invoices@example.com", scheme_id: "EM" });   // an object, whole
setField(draft, "BT-113", "50");                                              // /prepaid_amount
setFieldIn(draft.lines[0], "BT-153", "Widget");
addEntry(draft, "BG-25", line);
```

Reading takes an `Invoice`, writing an `InvoiceInput`, each with its own map
(`READ_FIELDS`, `WRITE_FIELDS`), so a code has one place in each direction and
a computed one (BT-112) isn't settable at all. A code inside a list has a
value per entry: `field` returns them all, located; `fieldIn` and
`setFieldIn` take one entry of the code's group, and the types admit only
that group's codes and entries (`fieldIn(line, "BT-136")` is a type error:
BT-136 is an allowance's). Writes mutate in place; `undefined` removes a value
and the objects it leaves empty. The types per code are `FieldTypes` and
`InputFieldTypes`.

## Allowances and charges

An allowance or charge is always stated as a resolved **`amount`**. That is the
operative value — the only one `computeTotals` reads and the only one that
reaches the totals. `base_amount` and `percentage` are documentation of how the
amount was arrived at; nothing derives the amount from them.

**If you work in percentages, you resolve the amount yourself:**

```ts
const base = 1000.0;          // the amount your percentage applies to
const percentage = 10;

invoice.document_allowances = [{
  amount: round2(base * percentage / 100),   // 100.00 — the operative value
  base_amount: base,                          // optional, documents the base
  percentage,                                 // optional, documents the rate
  vat_category_code: "S",
  vat_rate: 19,
}];
```

Conventional bases, which is what the schema descriptions and this package
assume:

| Adjustment | Base |
| --- | --- |
| Document allowance/charge | Sum of line net amounts at that entry's `vat_rate` |
| Line allowance/charge | That line's `quantity × net_price ÷ base_quantity` |

Where **both** `base_amount` and `percentage` are supplied, strict validation
requires them to agree with `amount` to within one cent (the slack is for
rounding-mode differences — half-to-even vs half-away-from-zero — not for
genuine mismatches). This catches a class of defect nothing else in the chain
sees: EN 16931 has no business rule tying the three values together, so an entry
reading `{base_amount: 1000, percentage: 10, amount: 50}` would otherwise deduct
50, render as "10 % of 1,000.00", and pass every schematron.

Partial validation is exempt, so a draft may hold a percentage whose amount has
not been recomputed yet. `checkAdjustmentDerivations(input)` runs the check on
its own and returns an Ajv-shaped error list.

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
