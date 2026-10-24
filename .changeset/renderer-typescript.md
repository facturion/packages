---
"@facturion/invoice-renderer": minor
---

Ported to TypeScript. The output is unchanged, byte for byte. The package now
ships compiled JavaScript with generated declarations (`dist/`) instead of
plain sources with a hand-written `index.d.ts`.

The declarations are stricter than before: a label resolver (`TFunction`)
receives a `LabelKey` (`view.*` strings that exist, `units.*`, and the
codelist namespaces), `VIEW` is keyed by `ViewKey`, and the new types `Lang`,
`LabelKey`, `LabelVars`, `ViewKey` and `RenderableInvoice` are exported. A
resolver written as `(key: string, vars?) => string` still fits.
