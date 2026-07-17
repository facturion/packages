---
"@facturion/invoice-renderer": patch
---

Codelist-backed labels (`vatCategory.*`, `taxPointDateCode.*`) degrade to the
raw code when a custom `t` misses, instead of leaking the lookup key
("vatCategory.AE") into the rendered document — matching how every other
codelist lookup already degrades.
