/** Public structural types for @facturion/codelists. Data-derived types
 *  (CodelistName, the per-list code unions, the entry metadata) are generated
 *  into `generated/index.ts` and re-exported from the package entry. */

/** A BCP-47-ish language tag. Any string the data carries a bucket for; lookups
 *  fall back to the default locale, then to the raw code. */
export type Locale = string;

/** One pickable option, framework-neutral. Map to your own combobox shape. */
export interface CodelistOption {
  /** The code committed on selection (and what `codelistLabel` reverses). */
  value: string;
  /** Human label in the requested locale (falls back to default locale / code). */
  label: string;
  /** The raw code — same as `value`; handy as a monospace chip beside the label
   *  when two codes share a label (e.g. C62 / H87 / PCE all read "Piece"). */
  code: string;
  /** Optional disambiguating hint in the requested locale. */
  description?: string;
  /** True when the code is in the list's curated preferred set. */
  preferred?: boolean;
  /** Non-interactive separator row (emitted by `preferredFirst`). */
  divider?: boolean;
}

export interface OptionOpts {
  /** `preserve` (YAML/source order, default), `label` (locale-collated by
   *  display label), or `code` (alphabetical by code). */
  sort?: "preserve" | "label" | "code";
  /** Float the preferred set above a `divider` row, then the rest. */
  preferredFirst?: boolean;
  /** Override the built-in preferred set for this call. */
  preferred?: string[];
}
