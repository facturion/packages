---
"@facturion/invoice-renderer": minor
---

Highlighting validation findings. `renderInvoice(…, { annotate: true })`
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
