// @facturion/invoice-renderer — render the @facturion/invoice simplified-JSON
// model to a human-readable HTML invoice (the basis for an HTML→PDF flow).

export { renderInvoice, esc, amt, curAmt, lineNet, computeTotals } from "./render.js";
export { renderInvoiceDocument } from "./document.js";
export { makeT, VIEW, DEFAULT_LANG } from "./i18n.js";
