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
const fragment = renderInvoice(invoice, { t: makeT("en") });
```

- **`renderInvoiceDocument(invoice, { lang?, t? })`** → full `<!DOCTYPE html>` document.
- **`renderInvoice(invoice, { t })`** → HTML fragment; `t(key, vars?)` resolves
  `view.*` / `units.*` / `paymentMeans.*` and returns the key on a miss. Use
  `makeT(lang)` for the default resolver, or inject your own.

Partial invoices render fine (missing sections simply don't appear), so the
renderer suits live previews as well as final documents.

The bundled stylesheet is also importable directly, e.g.
`@facturion/invoice-renderer/styles/view.css`.

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
