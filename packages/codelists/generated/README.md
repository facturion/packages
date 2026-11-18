# Generated codelists

Do not edit files in this directory by hand. They are emitted by
`src/generate.ts` from the YAML sources in `data/codelists/`.

To change a list: edit the relevant `data/codelists/*.yaml`, then run
`npm run generate`. The drift test fails if the committed outputs are
out of sync with the YAML sources.

The identifier-scheme lists (`icd-schemes.yaml`, `eas-schemes.yaml`) are
themselves generated from their upstreams by `npm run sync -- --schemes`;
their editorial additions live in `data/overlays/schemes.yaml`.
