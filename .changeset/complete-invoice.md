---
"@facturion/invoice": minor
---

Add `completeInvoice(draft)`: the invoice a draft becomes once issued, with `lines[].net_amount`, the full `vat_breakdown` (amounts, exemption reasons from the draft's entries) and `totals` filled in exactly as the XML writers emit them, i.e. the shape extraction returns. New types `DocumentTotals`, `VatBreakdownEntry` and `Completion`.

`computeTotals().taxSubtotals` is now in first-seen order (lines, then document allowances, then document charges), the order the XML writers emit BG-23 in, instead of sorted by rate. VAT groups are keyed on the numeric rate, so `"19"`, `"19.00"` and `19` form one group, as they do in the XML writers.
