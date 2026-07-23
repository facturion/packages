# @facturion/invoice

## 0.2.0

### Minor Changes

- 29b7d6a: Verify percentage/amount math reconciliation for document-level charges and allowances during schema validation.

## 0.1.2

### Patch Changes

- a0233c1: Round every EN 16931 `Amount` to two decimals in `computeTotals` / `lineNet`.

  None of them were. EN 16931 §6.5.2 fixes `Amount` at exactly 2dp and reserves
  unlimited precision for `UnitPriceAmount` (BT-146), `Quantity` (BT-129) and
  `Percentage` (BT-119) — but the model carried the full float through the whole
  chain, so BT-131, BT-106…BT-110, BT-112 and BT-115 all came out unrounded.

  Visible symptom: a €0.45 line at 19% with €0.54 already paid produced BT-117 =
  0.0855, hence a grand total of 0.5355 and a payable of −0.0045, which renders as
  **"-0.00 EUR"**. Found on a real customer-facing correction invoice.

  It had been latent since the beginning and only BT-113 exposed it: with no
  prepaid amount, a payable of 0.5355 displays as "0.54" and looks perfect. Each
  figure was rounded independently _for display_, so the printed subtotal, VAT and
  total could each be right while the arithmetic relating them was not.

  `round2` is now applied as each Amount is produced, in the standard's own order
  — each BT is defined in terms of the rounded BTs above it, so BT-117 is computed
  from a rounded BT-116 rather than from a running float. It rounds half away from
  zero (`Math.round` breaks ties toward +∞, which is wrong for credit notes and
  allowances), strips binary representation noise before deciding (1.005 is stored
  as 1.0049999999999998934, so a naive `Math.round(1.005 * 100)` yields 1.00 where
  commercial rounding requires 1.01), and never returns a negative zero. It is
  exported: consumers computing their own Amounts need the same rounding or their
  figures drift from these.

  `lineNet` rounds once at the end rather than per term, matching
  BT-131 = ((BT-129 ÷ BT-149) × BT-146) − Σ BT-136 + Σ BT-141: the inputs are
  unlimited-precision by design, and it is the result that is an Amount. So
  3 × €0.333 is now €1.00 rather than €0.999.

  No behaviour change for amounts that already rounded exactly — the existing
  golden two-rate fixture asserts identical figures. Its `cents()` test helper is
  gone: it rounded results before comparing them, which is precisely what the code
  was failing to do, so it laundered the defect it should have caught.

## 0.1.1

### Patch Changes

- 78f6cd8: Add a pure `./model` subpath exporting `lineNet`, `computeTotals` and the
  related types, with no validation dependency. Importing the package root
  eagerly compiles the Ajv validators at module load; consumers that only need
  the net/total math (e.g. the HTML renderer, and through it the browser) can now
  import from `@facturion/invoice/model` and keep Ajv out of their bundle.
- ff8c173: Refresh the bundled schema to the current EN 16931 simplified-invoice model:
  the `summary` (BG-22) group now includes the read-only `prepaid_amount`
  (BT-113) and `rounding_amount` (BT-114) echoes, matching the canonical schema.
  Derived types regenerated accordingly.
