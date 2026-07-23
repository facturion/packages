# @facturion/invoice-renderer

## 0.4.1

### Patch Changes

- Updated dependencies [29b7d6a]
  - @facturion/invoice@0.2.0

## 0.4.0

### Minor Changes

- d132af2: Make the theming seam real: every colour now resolves through a token, and the
  dark theme is a pure token override.

  The tokens scoped to `.invoice-paper` were the _dark_ palette, while the light
  theme — the default, and the one behind every rendered PDF — was ~47 hardcoded
  literals. Overriding `--text` therefore changed nothing in light mode and
  silently moved dark, so retheming meant reaching into `.inv-*` internals. Light
  now declares the palette, `.invoice-paper--dark` redeclares the same token
  names and adds no rules of its own, and the ~35 `.invoice-paper--dark .inv-*`
  rules are gone.

  Two dark tokens also leaked into non-dark rules, which fixes a visible defect
  in the light rendering:

  - `.data-table` row borders resolved to `rgba(255,255,255,0.08)` — white on a
    cream page, so line-item rows had **no visible separators**.
  - `.invoice-paper .data-table td` (0,2,1) outranked `.inv-lines` (0,1,0), so
    line-item cell text rendered in the dark theme's `--text-secondary`. The
    quantities, unit prices and amounts — the most important content on the
    invoice — were the faintest text on the page, while the description beside
    them was near-black. The shared table base no longer sets colour; cell colour
    comes from the table, as intended. This corrects the dark rendering too,
    where the same specificity bug overrode `--text`.

  Rendered output changes only inside the line-items table; markup is unchanged.
  The documented stylesheet import path was also wrong (`styles/view.css`, which
  throws `ERR_PACKAGE_PATH_NOT_EXPORTED`); it is `styles/invoice.css`, and the
  README now documents the token contract.

### Patch Changes

- 7c842e8: Codelist-backed labels (`vatCategory.*`, `taxPointDateCode.*`) degrade to the
  raw code when a custom `t` misses, instead of leaking the lookup key
  ("vatCategory.AE") into the rendered document — matching how every other
  codelist lookup already degrades.

## 0.3.0

### Minor Changes

- abedfb7: Exhaustive field-coverage pass: the renderer now surfaces every model field
  that can carry data, and formats deterministically from the document language.

  - BT-3 document titles resolve through the `invoiceTypes` codelist — a 384
    renders as "Corrected invoice"/"Rechnungskorrektur", not "Invoice". 380
    keeps the friendly "Invoice", 381 keeps "Credit Note"; unknown codes fall
    back to "Invoice".
  - Preceding invoices (BG-3) moved from the references list into the header,
    under the document number — on a corrective document the link to the
    original is part of its identity.
  - Locale-faithful formatting, independent of the process/browser locale:
    German documents get `17.07.2026` dates and `1.234,56` amounts; English
    keeps ISO dates and `1,234.56`. New exports `num()` and `fmtDate()`;
    `amt()`/`curAmt()` take an optional `lang`. `renderInvoice` accepts
    `opts.lang` (default `"en"`) — **callers that render non-English documents
    via `renderInvoice` must now pass `lang`**; `renderInvoiceDocument`
    threads its existing `lang` automatically.
  - Previously invisible fields now render: tax point date/code (BT-7/8), VAT
    accounting currency + VAT total in it (BT-6/BT-111), buyer accounting
    reference (BT-19, document and line), note subject codes (BT-21), party
    identifiers and electronic addresses with scheme IDs (BT-29/34/46/49/60),
    supporting documents (BG-24), price base quantity (BT-149/150), item
    seller/buyer/standard IDs, classifications, origin and attributes
    (BT-155…BT-161, BG-32), order line references (BT-132), line VAT category
    letters (BT-151) and breakdown category labels (BT-118) via the
    `vatCategory` codelist, exemption reason codes (BT-121), and
    allowance/charge percentage/base/reason codes.
  - Fixes: actual delivery date (BT-72) no longer suppressed when an invoicing
    period (BG-14) is present (EN 16931 allows both); the price discount
    (BT-147) is stated numerically instead of only implied; a negative prepaid
    amount (BT-113) renders sign-faithfully; hardcoded English "VAT"/"Tax-ID"/
    "Reg" party labels are localized.

### Patch Changes

- Updated dependencies [a0233c1]
  - @facturion/invoice@0.1.2

## 0.2.0

### Minor Changes

- 015c838: Slim the bundled stylesheet to the invoice render only. `styles/view.css`
  (which carried Facturion's app design system, page chrome, and the detailed
  renderer) is replaced by a self-contained `styles/invoice.css`: just the
  traditional `.invoice-paper`/`.inv-*` rules + the `.invoice-paper--dark` theme,
  with the design tokens it uses **scoped under `.invoice-paper`** (not `:root`)
  so the stylesheet can be imported into a host app without depending on or
  colliding with the app's global tokens.

  BREAKING: the `./styles/{view,utilities,variables}.css` subpath exports are
  removed in favour of a single `./styles/invoice.css`. `renderInvoice` /
  `renderInvoiceDocument` are unchanged and render identically.

## 0.1.1

### Patch Changes

- 78f6cd8: Embed the stylesheet as JS string constants (generated `src/styles.js`) instead
  of reading `styles/*.css` from disk at module load. This removes the
  `node:fs`/`node:path`/`node:url` imports from `document.js`, so the package is
  now fully browser-safe — bundlers no longer pull Node built-ins into the graph
  when an app imports the renderer. Rendered output is byte-identical.
- Updated dependencies [78f6cd8]
- Updated dependencies [ff8c173]
  - @facturion/invoice@0.1.1
