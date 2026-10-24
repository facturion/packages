# @facturion/rule-fields

Which fields of an e-invoice a validation rule concerns, and in what role.
A schematron finding says *that* a rule failed and *where* it fired (the
rule's context), not which field to fix: CII's BR-S-02 fires on a line's VAT
category, but the fix is the seller's VAT ID. These tables name the fields of
each rule over the [`@facturion/invoice`](https://www.npmjs.com/package/@facturion/invoice)
model, as [JSON Pointer patterns](https://www.npmjs.com/package/@facturion/pointer-patterns),
and `fieldsFor` turns a finding into concrete fields of an invoice.

```sh
npm install @facturion/rule-fields
```

| Table | Rules |
|---|---|
| `tables/en16931.json` | EN 16931 core (CEN), the rules whose location alone points at the wrong place or at nothing |
| `tables/xrechnung.json` | XRechnung 3.0 (BR-DE-*, BR-TMP-*, and the PEPPOL rules XRechnung runs) |
| `tables/fr.json` | The French e-invoicing rules (BR-FR-*, XP Z12-012) |
| `tables/facturion.json` | Facturion's optional German VAT content pack (FCT-VAT-DE-*) |

> **Status: draft.** The XRechnung table is reviewed; the others are drafted
> against each rule's test and not yet reviewed by a person.

## Usage

```ts
import { fieldsFor, loadTable, mergeTables } from "@facturion/rule-fields";
import { pointer } from "@facturion/pointer-patterns";
import en16931 from "@facturion/rule-fields/tables/en16931.json" with { type: "json" };
import xrechnung from "@facturion/rule-fields/tables/xrechnung.json" with { type: "json" };

const table = mergeTables(loadTable(en16931, "en16931"), loadTable(xrechnung, "xrechnung"));

// A finding from a validator that reports where each rule fired as a pointer
// into the invoice (its "anchor"), e.g. Facturion's /validate.
fieldsFor({ code: "BR-S-02", anchor: pointer("/lines/0/vat") }, table, invoice, "cii");
// → { mapping: "table", kind: "missing-any", fields: [
//      { role: "target", state: "absent", pointer: "/seller/vat_id" }, … ] }
```

Each field has a **role**: `target` is the field to fix; `condition` a field
whose value made the rule apply; `operand` an input of a calculation (whose
result is the target) or one side of a comparison. Its **state** is
`present`, `absent` (where the missing value would go) or `add-entry` (a list
lacks an entry the rule asks for). A finding without a table entry falls back
to its anchor.

`loadTable` checks a table once and throws a `TableError` listing every
problem, so what reaches `fieldsFor` is well-formed. Each table's `_meta`
documents the kinds, roles and conventions it follows.

The anchors have to come from whatever parsed the invoice into the
`@facturion/invoice` model, since only the parser knows which element became
which field (`PaymentMeans[3]` may be the second credit transfer).
