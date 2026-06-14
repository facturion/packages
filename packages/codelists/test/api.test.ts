import { test } from "node:test";
import assert from "node:assert/strict";
import * as cl from "../src/index.js";

test("codelistLabel resolves per locale, falls back to raw code", () => {
  assert.equal(cl.codelistLabel("units", "C62", "en"), "Unitless");
  assert.equal(cl.codelistLabel("units", "C62", "de"), "Ohne Einheit");
  assert.equal(cl.codelistLabel("units", "ZZZ", "en"), "ZZZ");
  assert.equal(cl.codelistLabel("units", "", "en"), "");
});

test("missing-locale label falls back to the default locale", () => {
  // invoice type 388 ("Tax invoice") ships en-only -> de must equal en.
  assert.equal(cl.codelistLabel("invoiceTypes", "388", "de"), cl.codelistLabel("invoiceTypes", "388", "en"));
  assert.equal(cl.codelistLabel("invoiceTypes", "388", "en"), "Tax invoice");
});

test("invoiceTypes is the expanded BT-3 set with a common preferred set", () => {
  const preferred = cl.preferredCodes("invoiceTypes");
  for (const c of ["380", "381", "383", "384", "386", "326", "389"]) {
    assert.ok(preferred.includes(c), `expected ${c} preferred`);
  }
  const codes = cl.codelistOptions("invoiceTypes", "en").map((o) => o.value);
  assert.ok(codes.includes("384"), "corrected invoice present");
  assert.ok(codes.includes("326"), "partial invoice present");
  assert.ok(codes.length > 20, `expected expanded set, got ${codes.length}`);
});

test("invoiceTypes preferredFirst floats the common set above a divider", () => {
  const opts = cl.codelistOptions("invoiceTypes", "en", { preferredFirst: true });
  const divider = opts.findIndex((o) => o.divider);
  assert.ok(divider > 0, "divider present");
  // everything before the divider is preferred; nothing after is.
  assert.ok(opts.slice(0, divider).every((o) => o.preferred));
  assert.ok(opts.slice(divider + 1).every((o) => !o.preferred));
});

test("currencyOptions floats preferred above a divider", () => {
  const opts = cl.currencyOptions("en");
  assert.equal(opts[0]?.preferred, true);
  assert.ok(opts.some((o) => o.divider));
});

test("hint text surfaces as option.description in the right locale", () => {
  const ae = cl.codelistOptions("vatCategory", "en").find((o) => o.value === "AE");
  assert.match(ae?.description ?? "", /buyer/i);
  const aeDe = cl.codelistOptions("vatCategory", "de").find((o) => o.value === "AE");
  assert.match(aeDe?.description ?? "", /Empfänger/);
});

test("icdSchemeOptions scopes by country; '' shows all", () => {
  const all = cl.icdSchemeOptions("", "en").map((o) => o.value).filter(Boolean);
  const de = cl.icdSchemeOptions("DE", "en").map((o) => o.value).filter(Boolean);
  assert.ok(all.length >= de.length && de.length > 0);
  // 0204 (German Leitweg-ID) must be offered in a DE context.
  assert.ok(de.includes("0204"));
});

test("label sort is locale-collated", () => {
  const sorted = cl.codelistOptions("countries", "de", { sort: "label" }).map((o) => o.label);
  const copy = [...sorted].sort(new Intl.Collator("de").compare);
  assert.deepEqual(sorted, copy);
});

test("locales() and defaultLocale()", () => {
  assert.deepEqual([...cl.locales()].sort(), ["de", "en"]);
  assert.equal(cl.defaultLocale(), "en");
});
