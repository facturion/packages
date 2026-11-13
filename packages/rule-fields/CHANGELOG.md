# @facturion/rule-fields

## 0.2.0

### Minor Changes

- 1af8ce9: The EN 16931 table maps 103 of the CII and UBL syntax-binding rules (CII-SR-\*, UBL-SR-\*): those that check a field occurs at most (or exactly) once, or that a field accompanies another. They fire on the block that holds the field, often the document itself, so a finding's location alone said only "somewhere in the invoice"; the entry now names the field. CII-SR-475, for example, maps to the supporting documents' descriptions instead of nothing. Most are `structural`. Rules that forbid elements the model has no field for stay unmapped: their block is all there is to point at.

## 0.1.2

### Patch Changes

- 737706f: BT-111 (VAT total in accounting currency) is mapped at `/totals/tax_amount_accounting_currency`, where an invoice document states it, instead of at the top-level input copy (`writeOnly` in `@facturion/invoice` 0.6.0). Affects BR-53, BR-DEC-15, PEPPOL-EN16931-R054/R055 and BR-FR-CO-12.

## 0.1.1

### Patch Changes

- 4df42ca: Ship the TypeScript sources the source maps point at, so a debugger or a
  bundler resolves them.
  (The renderer's generated `styles.ts` and `fonts.ts`, the stylesheet and the
  inlined font files as strings, stay out.)
- Updated dependencies [4df42ca]
  - @facturion/pointer-patterns@0.1.1

## 0.1.0

### Minor Changes

- 867d3b1: New package: rule → field tables for EN 16931, XRechnung, the French CTC rules
  and the VAT-DE content pack (drafts), with a validating loader and `fieldsFor`.

### Patch Changes

- Updated dependencies [36c513b]
  - @facturion/pointer-patterns@0.1.0
