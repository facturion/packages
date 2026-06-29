// Document-chrome strings for the rendered invoice (the `view.*` namespace) and
// the default label resolver. Vocabulary labels (`units.*`, `paymentMeans.*`)
// are not bundled here — they resolve through @facturion/codelists so the
// renderer and the rest of the toolchain share one source of truth.

import { codelistLabel, unitLabel } from "@facturion/codelists";

export const DEFAULT_LANG = "en";

// The document strings the renderer references via `t("view.<key>")`. Sourced
// from the Facturion app's invoice-view i18n; kept in sync deliberately.
export const VIEW = {
  en: {
    accountName: "Account holder",
    bic: "BIC",
    cardHolder: "Card holder",
    cardNumber: "Card number",
    contract: "Contract",
    creditNote: "Credit Note",
    creditorId: "Creditor ID",
    currency: "Currency",
    debitedAccount: "Debited account",
    deliverTo: "Deliver to",
    deliveryDate: "Delivery date",
    description: "Description",
    despatchAdvice: "Delivery note",
    documentAllowance: "Discount",
    documentCharge: "Charge",
    dueDate: "Due date",
    from: "From",
    iban: "IBAN",
    invoice: "Invoice",
    invoicingPeriod: "Invoicing period",
    issueDate: "Issue date",
    lineNo: "#",
    linePeriod: "Service period",
    lineTotal: "Total",
    mandateReference: "Mandate reference",
    notes: "Notes",
    objectIdentifier: "Object ID",
    payable: "Amount due",
    payee: "Payee",
    paymentInstructions: "Payment",
    paymentMeans: "Method",
    paymentTerms: "Payment terms",
    preceding: "Preceding invoice",
    prepaid: "Prepaid",
    project: "Project",
    purchaseOrder: "Your order",
    quantity: "Qty",
    receivingAdvice: "Receiving advice",
    remittance: "Reference",
    rounding: "Rounding",
    salesOrder: "Sales order",
    subtotal: "Subtotal",
    taxableAmount: "taxable",
    taxRate: "VAT",
    taxRep: "Tax representative",
    taxTotal: "VAT {{rate}} %",
    tender: "Tender / lot",
    to: "To",
    unitPrice: "Unit price",
  },
  de: {
    accountName: "Kontoinhaber",
    bic: "BIC",
    cardHolder: "Karteninhaber",
    cardNumber: "Kartennummer",
    contract: "Vertrag",
    creditNote: "Gutschrift",
    creditorId: "Gläubiger-ID",
    currency: "Währung",
    debitedAccount: "Belastetes Konto",
    deliverTo: "Lieferadresse",
    deliveryDate: "Leistungsdatum",
    description: "Beschreibung",
    despatchAdvice: "Lieferschein",
    documentAllowance: "Nachlass",
    documentCharge: "Aufschlag",
    dueDate: "Fälligkeitsdatum",
    from: "Von",
    iban: "IBAN",
    invoice: "Rechnung",
    invoicingPeriod: "Leistungszeitraum",
    issueDate: "Rechnungsdatum",
    lineNo: "#",
    linePeriod: "Leistungszeitraum",
    lineTotal: "Gesamt",
    mandateReference: "Mandatsreferenz",
    notes: "Hinweise",
    objectIdentifier: "Objekt-ID",
    payable: "Zahlbetrag",
    payee: "Zahlungsempfänger",
    paymentInstructions: "Zahlung",
    paymentMeans: "Zahlungsart",
    paymentTerms: "Zahlungsbedingungen",
    preceding: "Vorherige Rechnung",
    prepaid: "Bereits gezahlt",
    project: "Projekt",
    purchaseOrder: "Ihre Bestellung",
    quantity: "Menge",
    receivingAdvice: "Empfangsbestätigung",
    remittance: "Verwendungszweck",
    rounding: "Rundung",
    salesOrder: "Auftrag",
    subtotal: "Zwischensumme",
    taxableAmount: "netto",
    taxRate: "MwSt.",
    taxRep: "Steuervertreter",
    taxTotal: "MwSt. {{rate}} %",
    tender: "Ausschreibung",
    to: "An",
    unitPrice: "Einzelpreis",
  },
};

/**
 * Build the default label resolver for a language. Resolves `view.*` from the
 * bundled strings (with `{{var}}` interpolation), and `units.*` /
 * `paymentMeans.*` through @facturion/codelists. Returns the key unchanged on a
 * miss, so the renderer's own fallbacks (to the raw code) still apply.
 */
export function makeT(lang) {
  const view = VIEW[lang] ?? VIEW[DEFAULT_LANG];
  return (key, vars = {}) => {
    if (key.startsWith("units.")) {
      let code = key.slice("units.".length);
      const plural = code.endsWith("_plural");
      if (plural) code = code.slice(0, -"_plural".length);
      return unitLabel(code, lang, plural);
    }
    if (key.startsWith("paymentMeans.")) {
      return codelistLabel("paymentMeans", key.slice("paymentMeans.".length), lang);
    }
    const k = key.startsWith("view.") ? key.slice("view.".length) : key;
    const s = view[k];
    if (typeof s !== "string") return key;
    return s.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars[v] ?? ""));
  };
}
