---
"@facturion/invoice": patch
---

Refresh the bundled schema to the current EN 16931 simplified-invoice model:
the `summary` (BG-22) group now includes the read-only `prepaid_amount`
(BT-113) and `rounding_amount` (BT-114) echoes, matching the canonical schema.
Derived types regenerated accordingly.
