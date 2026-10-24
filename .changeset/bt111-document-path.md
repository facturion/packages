---
"@facturion/rule-fields": patch
---

BT-111 (VAT total in accounting currency) is mapped at `/totals/tax_amount_accounting_currency`, where an invoice document states it, instead of at the top-level input copy (`writeOnly` in `@facturion/invoice` 0.6.0). Affects BR-53, BR-DEC-15, PEPPOL-EN16931-R054/R055 and BR-FR-CO-12.
