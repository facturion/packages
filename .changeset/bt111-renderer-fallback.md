---
"@facturion/invoice-renderer": patch
---

Render BT-111 (VAT total in the accounting currency) from the top-level `tax_amount_accounting_currency` input when the invoice has no extracted `totals` echo, so a document rendered straight from its input data shows the figure.
