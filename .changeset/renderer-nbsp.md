---
"@facturion/invoice-renderer": patch
---

An amount and its currency are joined by a no-break space again (lost in
0.3.0), so "1,234.56 EUR" never breaks across lines.
