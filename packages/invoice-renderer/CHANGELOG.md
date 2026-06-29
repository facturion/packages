# @facturion/invoice-renderer

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
