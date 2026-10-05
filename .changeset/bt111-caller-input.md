---
"@facturion/invoice": minor
---

Add `tax_amount_accounting_currency` (BT-111) as a top-level input, required together with `vat_accounting_currency_code` (BT-6).

BT-111 is the invoice's VAT total converted into the VAT accounting currency. It depends on an exchange rate the lines don't carry, so it can't be derived, but until now the only place for it was the read-only `totals` echo, so callers had no way to supply it. A generator that set BT-6 had to invent BT-111 itself. Schematron (BR-53) only checks that BT-111 is present, so an invented figure passes validation.

**Breaking for inputs that set BT-6:** strict validation now rejects `vat_accounting_currency_code` without `tax_amount_accounting_currency`, and the reverse. Partial validation still accepts drafts that have only one of them, because the pairing is expressed as `dependentSchemas` + `required`, which partial mode strips. `totals.tax_amount_accounting_currency` stays the read-only extraction echo, the same arrangement as `prepaid_amount` / `rounding_amount`.
