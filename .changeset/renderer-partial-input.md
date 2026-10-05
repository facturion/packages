---
"@facturion/invoice-renderer": patch
---

Type `renderInvoice` / `renderInvoiceDocument` input as `PartialInvoice`. The renderer has always tolerated partial invoices (drafts, previews), but its declarations demanded a complete, strictly valid `Invoice`, so typed consumers had to cast at every draft call site.
