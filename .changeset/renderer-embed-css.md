---
"@facturion/invoice-renderer": patch
---

Embed the stylesheet as JS string constants (generated `src/styles.js`) instead
of reading `styles/*.css` from disk at module load. This removes the
`node:fs`/`node:path`/`node:url` imports from `document.js`, so the package is
now fully browser-safe — bundlers no longer pull Node built-ins into the graph
when an app imports the renderer. Rendered output is byte-identical.
