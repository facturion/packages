---
"@facturion/invoice-renderer": minor
---

Exhaustive field-coverage pass: the renderer now surfaces every model field
that can carry data, and formats deterministically from the document language.

- BT-3 document titles resolve through the `invoiceTypes` codelist — a 384
  renders as "Corrected invoice"/"Rechnungskorrektur", not "Invoice". 380
  keeps the friendly "Invoice", 381 keeps "Credit Note"; unknown codes fall
  back to "Invoice".
- Preceding invoices (BG-3) moved from the references list into the header,
  under the document number — on a corrective document the link to the
  original is part of its identity.
- Locale-faithful formatting, independent of the process/browser locale:
  German documents get `17.07.2026` dates and `1.234,56` amounts; English
  keeps ISO dates and `1,234.56`. New exports `num()` and `fmtDate()`;
  `amt()`/`curAmt()` take an optional `lang`. `renderInvoice` accepts
  `opts.lang` (default `"en"`) — **callers that render non-English documents
  via `renderInvoice` must now pass `lang`**; `renderInvoiceDocument`
  threads its existing `lang` automatically.
- Previously invisible fields now render: tax point date/code (BT-7/8), VAT
  accounting currency + VAT total in it (BT-6/BT-111), buyer accounting
  reference (BT-19, document and line), note subject codes (BT-21), party
  identifiers and electronic addresses with scheme IDs (BT-29/34/46/49/60),
  supporting documents (BG-24), price base quantity (BT-149/150), item
  seller/buyer/standard IDs, classifications, origin and attributes
  (BT-155…BT-161, BG-32), order line references (BT-132), line VAT category
  letters (BT-151) and breakdown category labels (BT-118) via the
  `vatCategory` codelist, exemption reason codes (BT-121), and
  allowance/charge percentage/base/reason codes.
- Fixes: actual delivery date (BT-72) no longer suppressed when an invoicing
  period (BG-14) is present (EN 16931 allows both); the price discount
  (BT-147) is stated numerically instead of only implied; a negative prepaid
  amount (BT-113) renders sign-faithfully; hardcoded English "VAT"/"Tax-ID"/
  "Reg" party labels are localized.
