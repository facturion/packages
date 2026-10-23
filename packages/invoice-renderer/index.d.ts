import type { Invoice, PartialInvoice } from "@facturion/invoice";

export type Lang = "en" | "de";

/** Label resolver: `(key, vars?) => string`, returning the key unchanged on a miss. */
export type TFunction = (key: string, vars?: Record<string, unknown>) => string;

/** An invoice that states its totals: extracted from XML, or a draft passed
 *  through `completeInvoice` from @facturion/invoice. The renderer shows the
 *  stated line nets, VAT breakdown and totals and computes none of them; other
 *  fields may still be missing (absent fields are simply not rendered). */
export type RenderableInvoice = PartialInvoice & { totals: NonNullable<PartialInvoice["totals"]> };

/** HTML-escape a value (`&`, `<`, `>`, `"`). */
export function esc(s: unknown): string;
/** Format a number with exactly two fraction digits, using the document
 *  language's separators (deterministic — never the process locale);
 *  non-numerics pass through escaped. */
export function amt(value: unknown, lang?: Lang): string;
/** `amt(value)` optionally suffixed with a currency code. */
export function curAmt(value: unknown, cur?: string, lang?: Lang): string;
/** Unlimited-precision number (quantity, rate, percentage) with the document
 *  language's separators. */
export function num(value: unknown, lang?: Lang): string;
/** Localize an ISO date for the document language (`de` → DD.MM.YYYY);
 *  other languages and non-ISO input pass through. */
export function fmtDate(value: unknown, lang?: Lang): string;

/** Render the invoice as an HTML fragment (no document chrome). `lang` drives
 *  date/number formatting; labels still come from `t`. Shows what the invoice
 *  states: render a draft as `renderInvoice(completeInvoice(draft), …)`. */
export function renderInvoice(invoice: RenderableInvoice, opts: { t: TFunction; lang?: Lang }): string;

/** Render a standalone HTML document (stylesheet inlined, default labels).
 *  Takes the same input as `renderInvoice`. */
export function renderInvoiceDocument(
  invoice: RenderableInvoice,
  opts?: { lang?: Lang; t?: TFunction },
): string;

/** Build the default label resolver for a language (bundled `view.*` + codelists). */
export function makeT(lang: Lang): TFunction;

/** Bundled `view.*` document strings, keyed by language. */
export const VIEW: Record<Lang, Record<string, string>>;
export const DEFAULT_LANG: Lang;

export type { Invoice, PartialInvoice };
