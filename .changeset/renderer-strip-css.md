---
"@facturion/invoice-renderer": minor
---

Slim the bundled stylesheet to the invoice render only. `styles/view.css`
(which carried Facturion's app design system, page chrome, and the detailed
renderer) is replaced by a self-contained `styles/invoice.css`: just the
traditional `.invoice-paper`/`.inv-*` rules + the `.invoice-paper--dark` theme,
with the design tokens it uses **scoped under `.invoice-paper`** (not `:root`)
so the stylesheet can be imported into a host app without depending on or
colliding with the app's global tokens.

BREAKING: the `./styles/{view,utilities,variables}.css` subpath exports are
removed in favour of a single `./styles/invoice.css`. `renderInvoice` /
`renderInvoiceDocument` are unchanged and render identically.
