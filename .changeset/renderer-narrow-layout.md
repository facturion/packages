---
"@facturion/invoice-renderer": minor
---

The document lays itself out for a narrow host. `.invoice-paper` is a size container, and below 540px of content width the header and parties stack, the totals take the full width and each line becomes a two-row block (`qty × price` under the item, the rate under the line amount) instead of a table that scrolls sideways. The layout follows the paper's own width, so a side-panel preview gets it too, and an A4 print never does. The old `@media (max-width: 600px)` rules are gone. A paper in a shrink-to-fit context (a flex row, an inline-block) needs a definite width now, or it collapses.

Markup: the line table's number cells also carry `inv-col-qty`, `inv-col-price`, `inv-col-vat` and `inv-col-net` (`inv-col-num` stays), and the table's parts carry their ARIA roles, which WebKit drops once they stop being displayed as table parts. The sign of a line's discount, allowance or charge is joined to its amount by U+00A0.

Fixed: the line table's numbers are right-aligned again; the table base rule outranked `.inv-col-num`. Quantity and price cells may wrap, so a paper just above the breakpoint no longer scrolls the last column out of sight.
