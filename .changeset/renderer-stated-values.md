---
"@facturion/invoice-renderer": minor
---

**Breaking:** the renderer no longer computes anything. Line net amounts, the VAT breakdown and the totals are rendered as the invoice states them (`lines[].net_amount`, `vat_breakdown`, `totals`), in the stated order. Extracted invoices now show what they say, even when it doesn't add up, instead of silently recomputed figures. Render a draft as `renderInvoice(completeInvoice(draft), …)` with `completeInvoice` from `@facturion/invoice`; a draft rendered without it shows no totals.

Input is typed as `RenderableInvoice` (a `PartialInvoice` with `totals`). The `lineNet` and `computeTotals` re-exports are removed; import them from `@facturion/invoice`.
