# @facturion/invoice-renderer

Render the [`@facturion/invoice`](https://www.npmjs.com/package/@facturion/invoice)
simplified-JSON model to a clean, human-readable **HTML invoice** — the
presentation layer behind Facturion's invoice PDFs (feed the HTML to headless
Chromium or any HTML→PDF tool).

It owns presentation only: layout, the document stylesheet, and the `view.*`
document strings. The data model and money math come from `@facturion/invoice`;
unit and payment-means labels come from `@facturion/codelists`.

## Install

```sh
npm install @facturion/invoice-renderer
```

## Usage

```ts
import { renderInvoiceDocument, renderInvoice, makeT } from "@facturion/invoice-renderer";

// Batteries-included: a standalone HTML document (stylesheet inlined, labels resolved).
const html = renderInvoiceDocument(invoice, { lang: "de" });

// Or just the fragment, with your own label resolver:
const fragment = renderInvoice(invoice, { t: makeT("en"), lang: "en" });
```

- **`renderInvoiceDocument(invoice, { lang?, t? })`** → full `<!DOCTYPE html>` document.
- **`renderInvoice(invoice, { t, lang? })`** → HTML fragment; `t(key, vars?)`
  resolves `view.*` / `units.*` / `paymentMeans.*` / `invoiceTypes.*` /
  `vatCategory.*` / `taxPointDateCode.*` and returns the key on a miss. Use
  `makeT(lang)` for the default resolver, or inject your own. `lang` drives
  date and number formatting (`de` → `17.07.2026`, `1.234,56`); formatting is
  deterministic per language — the process/browser locale is never consulted.

Partial invoices render fine (missing sections simply don't appear), so the
renderer suits live previews as well as final documents.

The bundled stylesheet is also importable directly:
`@facturion/invoice-renderer/styles/invoice.css`.

## Theming

The stylesheet is self-contained: its design tokens are scoped to
`.invoice-paper` rather than `:root`, so importing it neither depends on nor
collides with a host app's global tokens. Every colour and dimension resolves
through a token, and light — the default — is the palette declared on
`.invoice-paper`. Retheme by overriding tokens; you should never need to touch
`.inv-*` internals.

```css
/* Match the host's brand without restyling the document. */
.invoice-paper {
  --paper: #ffffff;
  --surface: #f4f6fb;
  --text-strong: #0b1f3a;
  --border: #d9e0ea;
}
```

`.invoice-paper--dark` is an optional dark preview. It is a pure token
override — it redeclares the same names and adds no rules of its own, so a
token you override applies to whichever mode declares it. Print always renders
on white regardless of mode.

Tokens are grouped as surfaces (`--paper`, `--surface`, `--surface-chip`), a
text ramp from `--text-strong` down to `--text-faint`, rules (`--border`,
`--border-strong`, `--border-accent`), semantic accents (`--accent-allowance`),
and the shared type/space scale (`--text-*`, `--space-*`, `--radius-*`).

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
