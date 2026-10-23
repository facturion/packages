# @facturion/invoice-renderer

Render the [`@facturion/invoice`](https://www.npmjs.com/package/@facturion/invoice)
simplified-JSON model to a clean, human-readable **HTML invoice** — the
presentation layer behind Facturion's invoice PDFs (feed the HTML to headless
Chromium or any HTML→PDF tool).

It owns presentation only: layout, the document stylesheet, and the `view.*`
document strings. It computes nothing: line net amounts, the VAT breakdown and
the totals are shown as the invoice states them. The data model comes from
`@facturion/invoice`; unit and payment-means labels come from
`@facturion/codelists`.

## Install

```sh
npm install @facturion/invoice-renderer
```

## Usage

```ts
import { renderInvoiceDocument, renderInvoice, makeT } from "@facturion/invoice-renderer";
import { completeInvoice } from "@facturion/invoice";

// Batteries-included: a standalone HTML document (stylesheet inlined, labels resolved).
// The document face (IBM Plex Sans) is inlined too, so the page needs no network.
const html = renderInvoiceDocument(invoice, { lang: "de" });

// A draft has no totals yet: complete it first, the way the server will.
const preview = renderInvoiceDocument(completeInvoice(draft), { lang: "de" });

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

### Drafts and issued invoices

The renderer shows what it is given and never makes a value up:

- **An extracted invoice** (parsed from UBL/CII) states its totals. They are
  rendered as stated, in the stated VAT order, even when they don't add up:
  showing what the document says is the point, and catching the contradiction
  is validation's job.
- **A draft** (what an editor or a `/create`-style request holds) has no totals,
  because they are outputs. Pass it through `completeInvoice` from
  `@facturion/invoice`, which fills them in exactly as the XML writers will.
  Rendered without that, a draft shows no totals and a dash for line amounts.

The totals block has a row for every total the invoice states, in the EN 16931
order: line sum, discounts and charges, net total, VAT per rate, VAT total,
gross total, prepaid, rounding, amount due. A total merges into the row above
when that row is its only addend and both state the same amount (one VAT rate
whose tax is the VAT total, say), so a typical invoice shows three rows. Two
amounts that disagree never merge: an inconsistent invoice shows both.

Otherwise partial invoices render fine (missing sections simply don't appear),
so the renderer suits live previews as well as final documents.

The bundled stylesheet is also importable directly:
`@facturion/invoice-renderer/styles/invoice.css`. Import
`@facturion/invoice-renderer/styles/fonts.css` beside it so a browser preview
draws the same face as the PDF.

## Typeface

The document is set in [IBM Plex Sans](https://github.com/IBM/plex) (SIL Open
Font License 1.1), shipped with the package at weights 400–700 in every subset
it comes in (Latin, Latin Extended, Cyrillic, Greek, Vietnamese).
`renderInvoiceDocument` inlines the faces as `data:` URIs, so an HTML→PDF
engine with no network and no fonts of its own still draws the document as the
preview does; `styles/fonts.css` declares the same faces with `unicode-range`,
so a browser fetches only the subsets a document uses. The family is the
`--font-family` token, overridable like any other.

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

The document is always light: it gets printed, attached and read by someone
else, so a preview shows it as it leaves.

Tokens are grouped as surfaces (`--paper`, `--surface`, `--surface-chip`), a
text ramp from `--text-strong` down to `--text-faint`, rules (`--border`,
`--border-strong`, `--border-accent`), semantic accents (`--accent-allowance`),
the face (`--font-family`), and the shared type/space scale (`--text-*`,
`--space-*`, `--radius-*`).

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
