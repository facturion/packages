---
"@facturion/pointer-patterns": patch
"@facturion/rule-fields": patch
"@facturion/invoice-renderer": patch
---

Ship the TypeScript sources the source maps point at, so a debugger or a
bundler resolves them.
(The renderer's generated `styles.ts` and `fonts.ts`, the stylesheet and the
inlined font files as strings, stay out.)
