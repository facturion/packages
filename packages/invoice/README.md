# @facturion/invoice

The Facturion **simplified-JSON invoice data model** — a small, friendly JSON
shape that covers the full [EN 16931](https://en.wikipedia.org/wiki/EN_16931)
semantic model, with validation and the canonical money math.

It ships:

- **The JSON Schema** (`data/invoice-schema.json`) — the canonical,
  language-neutral contract. Also exported as a runtime object.
- **Validators** — strict (every field required) and partial (nothing required;
  types, patterns and enums still enforced), built on Ajv with date-format
  checking.
- **Derived TypeScript types** — generated from the schema.
- **Money math** — `lineNet` and `computeTotals` (the net/VAT/totals chain down
  to the payable amount). Pure arithmetic, no presentation.

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

The raw schema is available for tooling at `@facturion/invoice/invoice-schema.json`.

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
