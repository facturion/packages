# Facturion open packages

Open-source (MIT) building blocks for EN 16931 / e-invoicing, published under the
[`@facturion`](https://www.npmjs.com/org/facturion) npm scope. Maintained by
[Facturion](https://facturion.de).

## Packages

| Package | Description |
|---|---|
| [`@facturion/codelists`](packages/codelists) | Friendly, multilingual EN 16931 / UN-CEFACT code lists (units, VAT categories, payment means, invoice types, countries, currencies, Peppol EAS schemes) with curated labels and hints. |

_(More to come — e.g. `@facturion/invoice-renderer`.)_

## Development

npm workspaces. Node ≥ 20.

```sh
npm install        # installs all workspaces (each package builds via its `prepare`)
npm run build      # build every package
npm test           # test every package
```

## Releasing

Versioning and publishing use [Changesets](https://github.com/changesets/changesets).

```sh
npm run changeset  # describe a change → creates a .changeset/*.md
```

On merge to `main`, the release workflow opens a "Version Packages" PR; merging
that PR publishes the changed packages to npm (with provenance). Independent
per-package versions.

## License

MIT — see [LICENSE](LICENSE). Each package's `NOTICE` attributes any incorporated
upstream data (Unicode CLDR, OpenPEPPOL, UN/CEFACT, …).
