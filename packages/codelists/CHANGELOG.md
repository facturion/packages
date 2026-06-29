# @facturion/codelists

## 0.1.1

### Patch Changes

- 7554fbe: Expose `./package.json` via the package's `exports`, so tooling can resolve the
  package root (e.g. to read the shipped `generated/buckets/*.json` data
  artifacts) without a resolve-and-ascend workaround.
- 00c3a70: Localize 19 more invoice-type (UNTDID 1001) labels to German — de coverage of
  the invoice-types list goes from 22/50 to 41/50. The realistically-met codes
  that arrived English-only (e.g. 71 Zahlungsaufforderung, 308 Delkredere-Gutschrift,
  396 Factoring-Gutschrift, 870 Konsignationsrechnung) now carry German labels; the
  obscure long-tail (the construction payment-valuation cluster, and codes with no
  distinct German term) stays English by design.
