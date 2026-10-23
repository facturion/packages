// Batteries-included wrapper: a standalone HTML document for an invoice, with
// the bundled stylesheet inlined and a default label resolver. This is what an
// HTML→PDF service (e.g. headless Chromium) consumes.
//
// The CSS and the document face are embedded as JS strings (./styles.js and
// ./fonts.js, generated from styles/invoice.css and the IBM Plex Sans files),
// so this module has no filesystem dependency and works in the browser as well
// as in Node — and the page needs no network to draw its own letters.

import { renderInvoice } from "./render.js";
import { makeT, DEFAULT_LANG } from "./i18n.js";
import { invoiceCss } from "./styles.js";
import { fontFacesCss } from "./fonts.js";

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
  const fragment = renderInvoice(invoice, { t: resolve, lang });
  const htmlLang = _HTML_LANG[lang] || DEFAULT_LANG;
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<style>
${fontFacesCss}
${invoiceCss}
body { margin: 0; padding: 0; background: #fff; }
</style>
</head>
<body>${fragment}</body>
</html>`;
}
