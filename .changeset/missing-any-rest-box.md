---
"@facturion/invoice-renderer": patch
---

highlight: a `missing-any` finding shows a missing box at rest again, one per group, for its first field the invoice prints. It showed none, so a rule with every alternative missing (the case that fires it) was invisible until focused. Fields may carry `group`, as `@facturion/rule-fields` returns them.
