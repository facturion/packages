---
"@facturion/invoice": patch
---

`completeInvoice` states a negative prepaid amount (BT-113) instead of dropping it. EN 16931 allows one (an already-settled negative invoice states a prepaid amount equal to its negative gross total), and it already counted towards the amount due, so a completed draft contradicted itself.
