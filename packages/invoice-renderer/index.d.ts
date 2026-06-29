import type { Invoice, InvoiceTotals } from "@facturion/invoice";

export type Lang = "en" | "de";

/** Label resolver: `(key, vars?) => string`, returning the key unchanged on a miss. */
export type TFunction = (key: string, vars?: Record<string, unknown>) => string;

export { lineNet, computeTotals } from "@facturion/invoice/model";

/** HTML-escape a value (`&`, `<`, `>`, `"`). */
export function esc(s: unknown): string;
/** Format a number with exactly two fraction digits; non-numerics pass through escaped. */
export function amt(value: unknown): string;
/** `amt(value)` optionally suffixed with a currency code. */
export function curAmt(value: unknown, cur?: string): string;

/** Render the invoice as an HTML fragment (no document chrome). */
export function renderInvoice(invoice: Invoice, opts: { t: TFunction }): string;

/** Render a standalone HTML document (stylesheet inlined, default labels). */
export function renderInvoiceDocument(
  invoice: Invoice,
  opts?: { lang?: Lang; t?: TFunction },
): string;

/** Build the default label resolver for a language (bundled `view.*` + codelists). */
export function makeT(lang: Lang): TFunction;

/** Bundled `view.*` document strings, keyed by language. */
export const VIEW: Record<Lang, Record<string, string>>;
export const DEFAULT_LANG: Lang;

export type { Invoice, InvoiceTotals };
