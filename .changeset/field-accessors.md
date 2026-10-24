---
"@facturion/invoice": minor
---

Fields by EN 16931 code: `field(doc, "BT-10")`, `fieldIn(line, "BT-153")`, `setField`, `setFieldIn`, `addEntry`, `addEntryIn`, typed per code from maps generated from the schema (`READ_FIELDS`, `WRITE_FIELDS`, `FieldTypes`, `InputFieldTypes`).

**Breaking:** the types now follow the schema's two directions. `Invoice` is the EN 16931 document (totals, VAT breakdown and line net amounts required; no caller-only fields), `InvoiceInput` what the schema accepts. Code that typed a draft as `Invoice` should use `InvoiceInput`; `completeInvoice(input)` returns an `Invoice`. `EN16931SimplifiedInvoice` remains as a deprecated name for `InvoiceInput`. `PartialInvoice` covers both directions' fields.

Schema: the top-level `prepaid_amount`, `rounding_amount` and `tax_amount_accounting_currency` are `writeOnly` (the document states them under `totals`); scheme attributes carry their EN 16931 sub-codes (BT-29-1, BT-49-1, …, BT-125-1/-2, BT-158-1/-2); the classification identifier and the attachment content no longer repeat their object's code.
