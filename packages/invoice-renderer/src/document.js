// Batteries-included wrapper: a standalone HTML document for an invoice, with
// the bundled stylesheet inlined and a default label resolver. This is what an
// HTML→PDF service (e.g. headless Chromium) consumes.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderInvoice } from "./render.js";
import { makeT, DEFAULT_LANG } from "./i18n.js";

const _stylesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "styles");
const _variablesCss = readFileSync(join(_stylesDir, "variables.css"), "utf-8");
const _utilitiesCss = readFileSync(join(_stylesDir, "utilities.css"), "utf-8");
const _viewCss = readFileSync(join(_stylesDir, "view.css"), "utf-8");

const _HTML_LANG = { en: "en", de: "de" };

/**
 * Build a standalone HTML document for an invoice.
 *
 * @param invoice Simplified EN 16931 JSON (see @facturion/invoice).
 * @param opts.lang Language for document strings. Default "en".
 * @param opts.t   Override the label resolver (advanced; bypasses the bundled
 *                 strings + codelists default).
 */
export function renderInvoiceDocument(invoice, { lang = DEFAULT_LANG, t } = {}) {
  const resolve = t ?? makeT(lang);
  const fragment = renderInvoice(invoice, { t: resolve });
  const htmlLang = _HTML_LANG[lang] || DEFAULT_LANG;
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<style>
${_variablesCss}
${_utilitiesCss}
${_viewCss}
body { margin: 0; padding: 0; background: #fff; }
</style>
</head>
<body>${fragment}</body>
</html>`;
}
