---
"@facturion/invoice-renderer": minor
---

The totals block shows every total the invoice states: the discount and charge sums (BT-107/108), the net total (BT-109), the VAT total (BT-110) and the gross total (BT-112) are new. A total merges into the row above when that row is its only addend and both state the same amount, so a typical invoice still shows three rows; amounts that disagree never merge, so an inconsistent invoice (a VAT total that isn't the sum of its VAT rows, say) shows the inconsistency. New labels: `view.netTotal`, `view.allowanceTotal`, `view.chargeTotal`, `view.vatTotal`, `view.grossTotal`.
