---
"@facturion/invoice-renderer": minor
---

A new document style: white paper, cool-grey section tints and rules, smaller
radii, a 14/13/11.5 px type scale, tighter spacing between sections, the
payment block as one wrapping line, a single rule above the totals, and A4
for a browser's own print.

The document is now set in IBM Plex Sans (OFL), shipped with the package:
`renderInvoiceDocument` inlines it, and `styles/fonts.css` declares it for
browser hosts. Previously the stylesheet named no font, so an HTML→PDF engine
fell back to its default serif.

Breaking: `.invoice-paper--dark` is removed. The document always renders
light, as it is printed.
