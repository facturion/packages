# @facturion/invoice-renderer

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
