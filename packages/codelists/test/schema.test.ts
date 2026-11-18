import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCodelist, CodelistError, type LocaleConfig } from "../src/schema.js";

const cfg: LocaleConfig = { locales: ["en", "de"], default: "en" };
const ok = (entries: unknown[], family: Parameters<typeof validateCodelist>[2] = "default", bucket = "x") =>
  validateCodelist("x.yaml", { name: "X", bucket, entries }, family, cfg);

test("valid list with default-only label passes", () => {
  ok([{ code: "A", label: { en: "Alpha" } }]);
});

test("missing default locale is rejected", () => {
  assert.throws(() => ok([{ code: "A", label: { de: "Alpha" } }]), CodelistError);
});

test("undeclared locale key is rejected", () => {
  assert.throws(() => ok([{ code: "A", label: { en: "a", fr: "b" } }]), /undeclared locale/);
});

test("duplicate code is rejected", () => {
  assert.throws(() => ok([{ code: "A", label: { en: "a" } }, { code: "A", label: { en: "b" } }]), /duplicates/);
});

test("plural only allowed on units", () => {
  assert.throws(() => ok([{ code: "A", label: { en: "a" }, plural: { en: "as" } }]), /plural only allowed/);
});

test("units family requires plural", () => {
  assert.throws(() => ok([{ code: "A", label: { en: "a" } }], "units", "units"), /requires "plural"/);
});

test("iso3 shape + uniqueness enforced", () => {
  assert.throws(() => ok([{ code: "DE", iso3: "DE", label: { en: "Germany" } }], "countries", "countries"), /iso3 must be/);
  assert.throws(
    () => ok([{ code: "DE", iso3: "DEU", label: { en: "G" } }, { code: "XX", iso3: "DEU", label: { en: "X" } }], "countries", "countries"),
    /iso3 "DEU" duplicates/,
  );
});

test("icd country accepts ISO-2 or international, rejects others", () => {
  ok([{ code: "X", country: "international", label: { en: "x" } }], "schemes", "icdSchemes");
  ok([{ code: "Y", country: "FR", label: { en: "y" } }], "schemes", "icdSchemes");
  assert.throws(() => ok([{ code: "Z", country: "DEU", label: { en: "z" } }], "schemes", "icdSchemes"), /country must be/);
});

test("overlay: partial labels allowed, unknown keys and locales rejected", async () => {
  const { validateOverlay } = await import("../src/schema.js");
  const ov = (entries: unknown[]) => validateOverlay("o.yaml", { name: "O", entries }, cfg);
  ov([{ code: "0204", preferred: true, label: { de: "Leitweg-ID" }, hint: { en: "h" } }]);
  assert.throws(() => ov([{ code: "1", iso3: "DEU" }]), /unknown key "iso3"/);
  assert.throws(() => ov([{ code: "1", label: { fr: "x" } }]), /undeclared locale/);
  assert.throws(() => ov([{ code: "1" }, { code: "1" }]), /duplicates/);
  assert.throws(() => ov([{ code: "1", hint: { de: "only de" } }]), /default locale/);
});

test("overlay country must be ISO-2 or international", async () => {
  const { validateOverlay } = await import("../src/schema.js");
  validateOverlay("o.yaml", { name: "O", entries: [{ code: "EM", country: "international" }] }, cfg);
  assert.throws(() => validateOverlay("o.yaml", { name: "O", entries: [{ code: "EM", country: "World" }] }, cfg), /country must be/);
});
