---
"@facturion/invoice-renderer": patch
---

highlight: outlines at the line table's outer edge are drawn whole. The table's scrolling wrapper clipped the outer side of a focused line, of its first or last cell, and of the first and last rows; `highlight.css` now pads the wrapper by an outline's reach (`--inv-hl-width` + `--inv-hl-offset`) without moving the table.
