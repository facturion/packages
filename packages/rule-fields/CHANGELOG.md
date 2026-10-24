# @facturion/rule-fields

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
