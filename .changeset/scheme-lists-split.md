---
"@facturion/codelists": minor
---

Split the identifier schemes into two generated lists, and rank by country instead of filtering.

- **`icdSchemes` is now the real ISO 6523 ICD list** (identifier and registration schemes, EN 16931 BR-CL-10/11): all 243 accepted codes. It used to mix in EAS-only codes (99xx), which fail BR-CL-10/11 when used as identifier schemes.
- **New `easSchemes` list** (CEF EAS, electronic address schemes, BR-CL-25): 104 codes including `EM`, with `easSchemeOptions()`, `easSchemesForCountry()` and `easSchemeEntries()`.
- **Breaking: `icdSchemeOptions(country, …)` ranks instead of filtering.** The country's own and international schemes come first (preferred ones leading), then a divider, then every other scheme. Nothing is hidden. `icdSchemesForCountry()` still returns the codes ranked first.
- **Both lists are generated** by `npm run sync -- --schemes` from pinned upstreams: code sets from the CEN EN 16931 validation artefacts (validation-1.3.16), names from ISO 6523 / Peppol / KoSIT, countries from Peppol. Editorial labels, hints and preferred flags moved to `data/overlays/schemes.yaml`.
- `IcdSchemeEntry` is deprecated in favour of `SchemeEntry`.
- Fixes the sync's Peppol source URL (v9.6 was withdrawn; now v9.7).
