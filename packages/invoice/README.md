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
- **Derived TypeScript types** — generated from the schema.
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
  type Invoice,
} from "@facturion/invoice";

const invoice: Invoice = JSON.parse(input);

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
