# @facturion/invoice-renderer

## 0.8.0

### Minor Changes

- 1f9bf2f: Highlighting validation findings. `renderInvoice(…, { annotate: true })`
  marks every rendered field with `data-path` (its JSON Pointer) and leaves a
  hidden, labelled slot where an absent field would print. The new `highlight`
  entry point marks findings on that markup in the browser (boxes by role,
  coloured by severity), styled by the new `styles/highlight.css` and
  themable through `--inv-hl-*` tokens. New `view.*` strings label the slots
  (`address`, `buyerReference`, `card`, `city`, `contact`, `contactName`,
  `creditTransfer`, `directDebit`, `email`, `itemAttribute`, `missing`,
  `phone`, `postCode`). Without `annotate` the fragment is unchanged; the
  document's embedded stylesheet gains three rules that only apply to
  annotated markup.
- 7dc99b0: Ported to TypeScript. The output is unchanged, byte for byte. The package now
  ships compiled JavaScript with generated declarations (`dist/`) instead of
  plain sources with a hand-written `index.d.ts`.

  The declarations are stricter than before: a label resolver (`TFunction`)
  receives a `LabelKey` (`view.*` strings that exist, `units.*`, and the
  codelist namespaces), `VIEW` is keyed by `ViewKey`, and the new types `Lang`,
  `LabelKey`, `LabelVars`, `ViewKey` and `RenderableInvoice` are exported. A
  resolver written as `(key: string, vars?) => string` still fits.

### Patch Changes

- b04b3b3: An amount and its currency are joined by a no-break space again (lost in
  0.3.0), so "1,234.56 EUR" never breaks across lines.
- 4df42ca: Ship the TypeScript sources the source maps point at, so a debugger or a
  bundler resolves them.
  (The renderer's generated `styles.ts` and `fonts.ts`, the stylesheet and the
  inlined font files as strings, stay out.)

## 0.7.1

### Patch Changes

- a6cf616: The totals open without a rule even when their first row is a sum (a line sum merged into the net total): its own top rule drew a second line just below the line table's.

## 0.7.0

### Minor Changes

- f08df30: A new document style: white paper, cool-grey section tints and rules, smaller
  radii, a 14/13/11.5 px type scale, tighter spacing between sections, the
  payment block as one wrapping line, a single rule above the totals, and A4
  for a browser's own print.

  The document is now set in IBM Plex Sans (OFL), shipped with the package:
  `renderInvoiceDocument` inlines it, and `styles/fonts.css` declares it for
  browser hosts. Previously the stylesheet named no font, so an HTML→PDF engine
  fell back to its default serif.

  Breaking: `.invoice-paper--dark` is removed. The document always renders
  light, as it is printed.

## 0.6.0

### Minor Changes

- 3bf2d59: The totals block shows every total the invoice states: the discount and charge sums (BT-107/108), the net total (BT-109), the VAT total (BT-110) and the gross total (BT-112) are new. A total merges into the row above when that row is its only addend and both state the same amount, so a typical invoice still shows three rows; amounts that disagree never merge, so an inconsistent invoice (a VAT total that isn't the sum of its VAT rows, say) shows the inconsistency. New labels: `view.netTotal`, `view.allowanceTotal`, `view.chargeTotal`, `view.vatTotal`, `view.grossTotal`.

### Patch Changes

- Updated dependencies [f5f4a95]
  - @facturion/invoice@0.5.1

## 0.5.0

### Minor Changes

- 84958b6: **Breaking:** the renderer no longer computes anything. Line net amounts, the VAT breakdown and the totals are rendered as the invoice states them (`lines[].net_amount`, `vat_breakdown`, `totals`), in the stated order. Extracted invoices now show what they say, even when it doesn't add up, instead of silently recomputed figures. Render a draft as `renderInvoice(completeInvoice(draft), …)` with `completeInvoice` from `@facturion/invoice`; a draft rendered without it shows no totals.

  Input is typed as `RenderableInvoice` (a `PartialInvoice` with `totals`). The `lineNet` and `computeTotals` re-exports are removed; import them from `@facturion/invoice`.

### Patch Changes

- Updated dependencies [84958b6]
  - @facturion/invoice@0.5.0

## 0.4.3

### Patch Changes

- d76d7f6: Type `renderInvoice` / `renderInvoiceDocument` input as `PartialInvoice`. The renderer has always tolerated partial invoices (drafts, previews), but its declarations demanded a complete, strictly valid `Invoice`, so typed consumers had to cast at every draft call site.
- Updated dependencies [d76d7f6]
  - @facturion/invoice@0.4.0

## 0.4.2

### Patch Changes

- b7e229a: Render BT-111 (VAT total in the accounting currency) from the top-level `tax_amount_accounting_currency` input when the invoice has no extracted `totals` echo, so a document rendered straight from its input data shows the figure.
- Updated dependencies [aa22ad9]
  - @facturion/invoice@0.3.0

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
