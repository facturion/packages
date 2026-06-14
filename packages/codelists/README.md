# @facturion/codelists

Friendly, multilingual EN 16931 / UN-CEFACT e-invoicing **code lists** — units of
measure, VAT categories, payment means, invoice types, tax-point dates, item
classification schemes, countries (ISO 3166), currencies (ISO 4217), and Peppol
EAS participant-identifier schemes — each with curated human labels and
short explanatory **hints**.

The codes and English standard names are facts from public standards; the value
this package adds is the **curation**: sensible defaults, preferred short-lists,
country-scoped EAS schemes, and hand-written disambiguation hints — translated.

- **Framework-agnostic, zero runtime dependencies.** Returns plain data; bring
  your own `<select>` / combobox.
- **Locale is explicit** on every call, with fallback: requested locale →
  default locale → raw code. Ships `en` + `de`; add more in `data/codelists`.
- **Typed.** Full `.d.ts`, including the `CodelistName` union.

## Install

```sh
npm install @facturion/codelists
```

## Use

```ts
import {
  codelistLabel, codelistOptions, currencyOptions, icdSchemeOptions,
} from "@facturion/codelists";

codelistLabel("units", "C62", "de");        // "Ohne Einheit"
codelistLabel("paymentMeans", "58", "en");  // "SEPA credit transfer"

// Options to feed a picker (value = code, label = friendly, code = chip,
// description = hint). `380` floats to the top of invoice types:
codelistOptions("invoiceTypes", "en", { preferredFirst: true });

// Currencies: preferred set, a divider, then the long tail:
currencyOptions("de");

// EAS schemes valid for a German buyer (0204 Leitweg-ID, …):
icdSchemeOptions("DE", "de");
```

### Lists (`CodelistName`)

`units` · `vatCategory` · `paymentMeans` · `invoiceTypes` · `taxPointDateCode` ·
`classificationSchemes` · `countries` · `currencies` · `icdSchemes`

## Maintaining the data

Sources of truth are the YAML files in `data/codelists/`. After editing, run
`npm run generate`; the drift test enforces that committed artifacts stay in
sync. `npm run sync` reports drift against upstreams (CLDR for localized
country/currency names, Peppol for EAS) and can `--apply` new codes or
`--relabel` existing ones.

## Licensing

MIT (see `LICENSE`). Incorporated upstream data is attributed in `NOTICE`:
localized country/currency names from **Unicode CLDR** (Unicode-3.0), Peppol EAS
names from **OpenPEPPOL** (Apache-2.0), and UN/CEFACT + ISO standard codes.
