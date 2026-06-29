# @facturion/invoice

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
