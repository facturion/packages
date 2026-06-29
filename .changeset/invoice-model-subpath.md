---
"@facturion/invoice": patch
---

Add a pure `./model` subpath exporting `lineNet`, `computeTotals` and the
related types, with no validation dependency. Importing the package root
eagerly compiles the Ajv validators at module load; consumers that only need
the net/total math (e.g. the HTML renderer, and through it the browser) can now
import from `@facturion/invoice/model` and keep Ajv out of their bundle.
