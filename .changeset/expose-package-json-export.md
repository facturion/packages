---
"@facturion/codelists": patch
---

Expose `./package.json` via the package's `exports`, so tooling can resolve the
package root (e.g. to read the shipped `generated/buckets/*.json` data
artifacts) without a resolve-and-ascend workaround.
