// Document-chrome strings for the rendered invoice (the `view.*` namespace) and
// the default label resolver. Vocabulary labels (`units.*`, `paymentMeans.*`,
// `invoiceTypes.*`, `vatCategory.*`, `taxPointDateCode.*`) are not bundled here
// — they resolve through @facturion/codelists so the renderer and the rest of
// the toolchain share one source of truth.

import { codelistLabel, unitLabel, type CodelistName } from "@facturion/codelists";

/** The document languages the renderer ships strings and number formats for. */
export type Lang = "en" | "de";

export const DEFAULT_LANG: Lang = "en";

// The document strings the renderer references via `t("view.<key>")`. Sourced
// from the Facturion app's invoice-view i18n; kept in sync deliberately. The
// English set defines the keys; every other language has exactly the same ones.
const EN = {
  accountingRef: "Accounting reference",
  accountName: "Account holder",
  allowanceTotal: "Total discounts",
  attachments: "Attachments",
  bic: "BIC",
  cardHolder: "Card holder",
  cardNumber: "Card number",
  chargeTotal: "Total charges",
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
  grossTotal: "Total incl. VAT",
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
  netTotal: "Total net",
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
  vatTotal: "Total VAT",
} as const satisfies Record<string, string>;

/** A `view.*` document string. */
export type ViewKey = keyof typeof EN;

const DE: Readonly<Record<ViewKey, string>> = {
  accountingRef: "Buchungsreferenz",
  accountName: "Kontoinhaber",
  allowanceTotal: "Summe Nachlässe",
  attachments: "Anlagen",
  bic: "BIC",
  cardHolder: "Karteninhaber",
  cardNumber: "Kartennummer",
  chargeTotal: "Summe Aufschläge",
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
  grossTotal: "Gesamtbetrag brutto",
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
  netTotal: "Summe netto",
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
  vatTotal: "MwSt. gesamt",
};

/** Bundled `view.*` document strings, keyed by language. */
export const VIEW: Readonly<Record<Lang, Readonly<Record<ViewKey, string>>>> = { en: EN, de: DE };

// Codelist-backed namespaces: `t("<prefix>.<code>")` resolves the code's label
// via @facturion/codelists (falling back to the raw code on a miss).
const _CODELIST_PREFIXES = ["paymentMeans", "invoiceTypes", "vatCategory", "taxPointDateCode"] as const satisfies readonly CodelistName[];
type CodelistPrefix = (typeof _CODELIST_PREFIXES)[number];

/** Every key the renderer asks its label resolver for: a `view.*` document
 *  string, a unit (`units.C62`, `units.C62_plural`) or a codelist entry. */
export type LabelKey = `view.${ViewKey}` | `units.${string}` | `${CodelistPrefix}.${string}`;

/** Interpolation values for the `{{var}}` placeholders of a `view.*` string. */
export type LabelVars = Readonly<Record<string, string>>;

/** Label resolver: returns the label for `key`, or `key` itself on a miss (the
 *  renderer then falls back to the raw code). Any `(key: string, …) => string`
 *  is one. */
export type TFunction = (key: LabelKey, vars?: LabelVars) => string;

const isCodelistPrefix = (s: string): s is CodelistPrefix => (_CODELIST_PREFIXES as readonly string[]).includes(s);
const isViewKey = (s: string): s is ViewKey => Object.hasOwn(EN, s);

/**
 * Build the default label resolver for a language. Resolves `view.*` from the
 * bundled strings (with `{{var}}` interpolation), and `units.*` /
 * `paymentMeans.*` / `invoiceTypes.*` / `vatCategory.*` / `taxPointDateCode.*`
 * through @facturion/codelists. Returns the key unchanged on a miss, so the
 * renderer's own fallbacks (to the raw code) still apply.
 */
export function makeT(lang: Lang): TFunction {
  // Typed callers pass a Lang; a JS caller's unknown language gets the default.
  const view = VIEW[lang] ?? VIEW[DEFAULT_LANG];
  return (key, vars = {}) => {
    if (key.startsWith("units.")) {
      let code = key.slice("units.".length);
      const plural = code.endsWith("_plural");
      if (plural) code = code.slice(0, -"_plural".length);
      return unitLabel(code, lang, plural);
    }
    const dot = key.indexOf(".");
    const prefix = dot > 0 ? key.slice(0, dot) : "";
    if (isCodelistPrefix(prefix)) {
      return codelistLabel(prefix, key.slice(dot + 1), lang);
    }
    const k = key.startsWith("view.") ? key.slice("view.".length) : key;
    if (!isViewKey(k)) return key;
    return view[k].replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ""));
  };
}

/** The placeholders each interpolated `view.*` string takes. */
interface ViewPlaceholders {
  perBase: "qty";
  priceBefore: "price";
  taxTotal: "rate";
  taxTotalIn: "cur";
}

/** `t("view.<key>")`, with exactly the placeholders that string takes: the
 *  renderer can't ask for a string that doesn't exist or forget a value. */
export function viewLabel<K extends ViewKey>(
  t: TFunction,
  key: K,
  ...vars: K extends keyof ViewPlaceholders ? [Record<ViewPlaceholders[K], string>] : []
): string {
  return vars.length ? t(`view.${key}`, vars[0]) : t(`view.${key}`);
}
