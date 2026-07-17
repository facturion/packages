// Document-chrome strings for the rendered invoice (the `view.*` namespace) and
// the default label resolver. Vocabulary labels (`units.*`, `paymentMeans.*`,
// `invoiceTypes.*`, `vatCategory.*`, `taxPointDateCode.*`) are not bundled here
// — they resolve through @facturion/codelists so the renderer and the rest of
// the toolchain share one source of truth.

import { codelistLabel, unitLabel } from "@facturion/codelists";

export const DEFAULT_LANG = "en";

// The document strings the renderer references via `t("view.<key>")`. Sourced
// from the Facturion app's invoice-view i18n; kept in sync deliberately.
export const VIEW = {
  en: {
    accountingRef: "Accounting reference",
    accountName: "Account holder",
    attachments: "Attachments",
    bic: "BIC",
    cardHolder: "Card holder",
    cardNumber: "Card number",
    classification: "Classification",
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
    eAddress: "Electronic address",
    from: "From",
    iban: "IBAN",
    identifier: "ID",
    invoice: "Invoice",
    invoicingPeriod: "Invoicing period",
    issueDate: "Issue date",
    itemBuyerId: "Your item no.",
    itemSellerId: "Item no.",
    itemStandardId: "Item ID",
    lineNo: "#",
    linePeriod: "Service period",
    lineTotal: "Total",
    mandateReference: "Mandate reference",
    notes: "Notes",
    objectIdentifier: "Object ID",
    of: "of",
    orderLine: "Order line",
    origin: "Country of origin",
    payable: "Amount due",
    payee: "Payee",
    paymentInstructions: "Payment",
    paymentMeans: "Method",
    paymentTerms: "Payment terms",
    perBase: "per {{qty}}",
    preceding: "Preceding invoice",
    prepaid: "Prepaid",
    priceBefore: "was {{price}}",
    project: "Project",
    purchaseOrder: "Your order",
    quantity: "Qty",
    receivingAdvice: "Receiving advice",
    regId: "Reg. no.",
    remittance: "Reference",
    rounding: "Rounding",
    salesOrder: "Sales order",
    subtotal: "Subtotal",
    taxableAmount: "taxable",
    taxPointDate: "Tax point date",
    taxRate: "VAT",
    taxRegId: "Tax no.",
    taxRep: "Tax representative",
    taxTotal: "VAT {{rate}} %",
    taxTotalIn: "VAT total in {{cur}}",
    tender: "Tender / lot",
    to: "To",
    unitPrice: "Unit price",
    vatCurrency: "VAT currency",
    vatId: "VAT ID",
  },
  de: {
    accountingRef: "Buchungsreferenz",
    accountName: "Kontoinhaber",
    attachments: "Anlagen",
    bic: "BIC",
    cardHolder: "Karteninhaber",
    cardNumber: "Kartennummer",
    classification: "Klassifikation",
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
    eAddress: "Elektronische Adresse",
    from: "Von",
    iban: "IBAN",
    identifier: "ID",
    invoice: "Rechnung",
    invoicingPeriod: "Leistungszeitraum",
    issueDate: "Rechnungsdatum",
    itemBuyerId: "Ihre Artikel-Nr.",
    itemSellerId: "Artikel-Nr.",
    itemStandardId: "Artikel-ID",
    lineNo: "#",
    linePeriod: "Leistungszeitraum",
    lineTotal: "Gesamt",
    mandateReference: "Mandatsreferenz",
    notes: "Hinweise",
    objectIdentifier: "Objekt-ID",
    of: "von",
    orderLine: "Bestellposition",
    origin: "Ursprungsland",
    payable: "Zahlbetrag",
    payee: "Zahlungsempfänger",
    paymentInstructions: "Zahlung",
    paymentMeans: "Zahlungsart",
    paymentTerms: "Zahlungsbedingungen",
    perBase: "je {{qty}}",
    preceding: "Vorherige Rechnung",
    prepaid: "Bereits gezahlt",
    priceBefore: "statt {{price}}",
    project: "Projekt",
    purchaseOrder: "Ihre Bestellung",
    quantity: "Menge",
    receivingAdvice: "Empfangsbestätigung",
    regId: "Registernr.",
    remittance: "Verwendungszweck",
    rounding: "Rundung",
    salesOrder: "Auftrag",
    subtotal: "Zwischensumme",
    taxableAmount: "netto",
    taxPointDate: "Datum der Steuerfälligkeit",
    taxRate: "MwSt.",
    taxRegId: "Steuernummer",
    taxRep: "Steuervertreter",
    taxTotal: "MwSt. {{rate}} %",
    taxTotalIn: "USt. gesamt in {{cur}}",
    tender: "Ausschreibung",
    to: "An",
    unitPrice: "Einzelpreis",
    vatCurrency: "USt.-Währung",
    vatId: "USt-IdNr.",
  },
};

// Codelist-backed namespaces: `t("<prefix>.<code>")` resolves the code's label
// via @facturion/codelists (falling back to the raw code on a miss).
const _CODELIST_PREFIXES = {
  paymentMeans: "paymentMeans",
  invoiceTypes: "invoiceTypes",
  vatCategory: "vatCategory",
  taxPointDateCode: "taxPointDateCode",
};

/**
 * Build the default label resolver for a language. Resolves `view.*` from the
 * bundled strings (with `{{var}}` interpolation), and `units.*` /
 * `paymentMeans.*` / `invoiceTypes.*` / `vatCategory.*` / `taxPointDateCode.*`
 * through @facturion/codelists. Returns the key unchanged on a miss, so the
 * renderer's own fallbacks (to the raw code) still apply.
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
    const dot = key.indexOf(".");
    const bucket = dot > 0 ? _CODELIST_PREFIXES[key.slice(0, dot)] : undefined;
    if (bucket) {
      return codelistLabel(bucket, key.slice(dot + 1), lang);
    }
    const k = key.startsWith("view.") ? key.slice("view.".length) : key;
    const s = view[k];
    if (typeof s !== "string") return key;
    return s.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars[v] ?? ""));
  };
}
