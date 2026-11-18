import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSchemeLists,
  genericodeRows,
  peppolSchemes,
  schematronCodes,
  vefaNames,
  xmlText,
} from "../src/schemes-upstream.js";

const SCH = `
  <rule context="cac:PartyIdentification/cbc:ID[@schemeID]" flag="fatal">
    <assert
      test="((not(contains(normalize-space(@schemeID), ' ')) and contains(' 0002 0088 0204 ', concat(' ', normalize-space(@schemeID), ' '))))"
      id="BR-CL-10"
      flag="fatal">[BR-CL-10]-Any identifier …</assert>
  </rule>
  <rule context="cbc:EndpointID[@schemeID]" flag="fatal">
    <assert
      test="((not(contains(normalize-space(@schemeID), ' ')) and contains(' 0088 0204 9930 EM ', concat(' ', normalize-space(@schemeID), ' '))))"
      id="BR-CL-25"
      flag="fatal">[BR-CL-25]-Endpoint …</assert>
  </rule>`;

test("schematronCodes reads the accepted set of one rule", () => {
  assert.deepEqual(schematronCodes(SCH, "BR-CL-10"), ["0002", "0088", "0204"]);
  assert.deepEqual(schematronCodes(SCH, "BR-CL-25"), ["0088", "0204", "9930", "EM"]);
  assert.throws(() => schematronCodes(SCH, "BR-CL-99"), /no assert/);
});

test("vefaNames decodes entities and unwraps quoted, wrapped names", () => {
  const xml = `<CodeList><Code>
    <Id>0106</Id>
    <Name>"Vereniging van Kamers van Koophandel (Association of
            Chambers) &amp; Co"</Name></Code>
    <Code><Id>0088</Id><Name>Global Location Number</Name><Description>x</Description></Code></CodeList>`;
  const m = vefaNames(xml);
  assert.equal(m.get("0106"), "Vereniging van Kamers van Koophandel (Association of Chambers) & Co");
  assert.equal(m.get("0088"), "Global Location Number");
  assert.throws(() => vefaNames("<CodeList/>"), /no <Code>/);
});

test("genericodeRows maps column refs per row", () => {
  const xml = `<SimpleCodeList><Row>
      <Value ColumnRef="aesc"><SimpleValue>EM</SimpleValue></Value>
      <Value ColumnRef="scheme-name"><SimpleValue>Electronic mail</SimpleValue></Value>
    </Row></SimpleCodeList>`;
  assert.deepEqual(genericodeRows(xml), [{ aesc: "EM", "scheme-name": "Electronic mail" }]);
});

test("xmlText decodes numeric entities", () => {
  assert.equal(xmlText("Unit&#224; &#x26; co"), "Unità & co");
});

test("buildSchemeLists: codes from the rule sets, names and countries joined", () => {
  const { icd, eas, unnamed } = buildSchemeLists({
    icdCodes: ["0204", "0002", "0088"],
    easCodes: ["9930", "0088", "EM", "ZZ01"],
    icdNames: new Map([["0002", "SIRENE"], ["0088", "Global Location Number"], ["0204", "Leitweg-ID"]]),
    peppol: peppolSchemes({
      values: [
        { iso6523: "0088", "scheme-name": "GLN (Peppol)", country: "international", state: "active" },
        { iso6523: "0204", "scheme-name": "Peppol-Leitweg-ID", country: "DE", state: "active" },
        { iso6523: "9930", "scheme-name": "Germany VAT number", country: "DE", state: "active" },
        { iso6523: "0002", "scheme-name": "SIRENE", country: "XX-not-a-tag", state: "deprecated" },
      ],
    }),
    kositEas: [{ aesc: "EM", "scheme-name": "Electronic mail" }],
  });
  assert.deepEqual(icd, [
    { code: "0002", name: "SIRENE" },
    { code: "0088", name: "Global Location Number", country: "international" },
    { code: "0204", name: "Leitweg-ID", country: "DE" },
  ]);
  // EAS 0xxx codes keep their ISO 6523 name; EAS-only codes fall back.
  assert.deepEqual(eas, [
    { code: "0088", name: "Global Location Number", country: "international" },
    { code: "9930", name: "Germany VAT number", country: "DE" },
    { code: "EM", name: "Electronic mail" },
    { code: "ZZ01", name: "ZZ01" },
  ]);
  assert.deepEqual(unnamed, ["ZZ01"]);
});
