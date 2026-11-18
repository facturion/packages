# @facturion/codelists

Friendly, multilingual EN 16931 / UN-CEFACT e-invoicing **code lists** — units of
measure, VAT categories, payment means, invoice types, tax-point dates, item
classification schemes, countries (ISO 3166), currencies (ISO 4217), and the
two identifier-scheme lists: **ISO 6523 ICD** (identifier and registration
schemes) and **CEF EAS** (electronic address schemes) — each with curated human
labels and short explanatory **hints**.

The codes and English standard names are facts from public standards; the value
this package adds is the **curation**: sensible defaults, preferred short-lists,
country-ranked identifier schemes, and hand-written disambiguation hints — translated.

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
  codelistLabel, codelistOptions, currencyOptions, icdSchemeOptions, easSchemeOptions,
} from "@facturion/codelists";

codelistLabel("units", "C62", "de");        // "Ohne Einheit"
codelistLabel("paymentMeans", "58", "en");  // "SEPA credit transfer"

// Options to feed a picker (value = code, label = friendly, code = chip,
// description = hint). `380` floats to the top of invoice types:
codelistOptions("invoiceTypes", "en", { preferredFirst: true });

// Currencies: preferred set, a divider, then the long tail:
currencyOptions("de");

// Identifier schemes (BT-29-1, BT-30-1, BT-46-1, …) for a German party: German
// and international schemes first (0204 Leitweg-ID, 0088 GLN, …), a divider,
// then every other ISO 6523 scheme. A country ranks; it never hides a scheme.
icdSchemeOptions("DE", "de");

// Electronic address schemes (BT-34-1, BT-49-1), ranked the same way. A
// different list: EAS-only codes such as 9930 or EM are not ISO 6523 codes and
// fail EN 16931 rules BR-CL-10/11 when used as identifier schemes.
easSchemeOptions("DE", "de");
```

### Lists (`CodelistName`)

`units` · `vatCategory` · `paymentMeans` · `invoiceTypes` · `taxPointDateCode` ·
`classificationSchemes` · `countries` · `currencies` · `icdSchemes` · `easSchemes`

## Maintaining the data

Sources of truth are the YAML files in `data/codelists/`. After editing, run
`npm run generate`; the drift test enforces that committed artifacts stay in
sync. `npm run sync` reports drift against upstreams (CLDR for localized
country/currency names) and can `--apply` new codes or `--relabel` existing
ones.

The identifier-scheme lists are generated, not edited: `npm run sync --
--schemes` rewrites `icd-schemes.yaml` and `eas-schemes.yaml` from their
upstreams (pinned in `data/codelists/sources.json`):

- **Which codes:** the sets the EN 16931 rules accept, read from the CEN
  validation artefacts' codes schematron (BR-CL-10/11 for ICD, BR-CL-25 for
  EAS). Bump the pinned CEN release together with the validators you use.
- **Names:** ISO 6523 names (OpenPEPPOL's ICD list), then Peppol's participant
  identifier schemes and KoSIT's EAS list for EAS-only codes.
- **Country:** Peppol's participant identifier schemes, joined by code.

Editorial additions — preferred flags, hints, short or translated labels — live
in `data/overlays/schemes.yaml`, keyed by code and applied to whichever list
carries the code. `npm run generate` fails on an overlay code no list carries.

## Licensing

MIT (see `LICENSE`). Incorporated upstream data is attributed in `NOTICE`:
localized country/currency names from **Unicode CLDR** (Unicode-3.0), identifier
scheme code sets from the **CEN EN 16931 validation artefacts** (EUPL-1.2),
scheme names and countries from **OpenPEPPOL** (Apache-2.0) and the ISO 6523 /
CEF EAS registries, and UN/CEFACT + ISO standard codes.
