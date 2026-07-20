---
"@facturion/invoice-renderer": minor
---

Make the theming seam real: every colour now resolves through a token, and the
dark theme is a pure token override.

The tokens scoped to `.invoice-paper` were the *dark* palette, while the light
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
