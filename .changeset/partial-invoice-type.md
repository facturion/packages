---
"@facturion/invoice": minor
---

Export a `PartialInvoice` type: the invoice with every field optional, recursively, which is the shape `validatePartialInvoice` accepts. `assertPartialInvoice` now narrows its argument to it.
