---
"@facturion/rule-fields": minor
---

The EN 16931 table maps 103 of the CII and UBL syntax-binding rules (CII-SR-\*, UBL-SR-\*): those that check a field occurs at most (or exactly) once, or that a field accompanies another. They fire on the block that holds the field, often the document itself, so a finding's location alone said only "somewhere in the invoice"; the entry now names the field. CII-SR-475, for example, maps to the supporting documents' descriptions instead of nothing. Most are `structural`. Rules that forbid elements the model has no field for stay unmapped: their block is all there is to point at.
