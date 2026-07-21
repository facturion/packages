/** Validation against the simplified-invoice JSON Schema.
 *
 *  Two modes of the same model:
 *    - strict  (`validateInvoice` / `assertValidInvoice`): the full schema,
 *      every `required` enforced — the gate for inbound data to be processed.
 *    - partial (`validatePartialInvoice` / `assertPartialInvoice`): the same
 *      schema with every `required` keyword stripped, so types, patterns and
 *      enums are still enforced but no field is mandatory. The mode for drafts,
 *      previews and the renderer, which tolerate omitted fields.
 *
 *  Each validator is its own Ajv instance: the relaxed clone keeps the original
 *  `$id`, so compiling both in one instance would collide.
 *
 *  Strict mode additionally runs the cross-field checks in `adjustments.ts` —
 *  arithmetic JSON Schema cannot express. See that module for why they exist
 *  and why partial mode is deliberately exempt. */

import Ajv2020Default from "ajv/dist/2020.js";
import addFormatsDefault from "ajv-formats";
import type { ErrorObject, SchemaObject, ValidateFunction } from "ajv";
import { invoiceSchema } from "../generated/schema.js";
import type { EN16931SimplifiedInvoice } from "../generated/invoice-types.js";
import { checkAdjustmentDerivations } from "./adjustments.js";

// ajv and ajv-formats are CJS; under NodeNext the default import is typed as
// the module namespace and (depending on the consumer's interop) may arrive
// wrapped in `.default` at runtime. Normalize both so this compiles strictly
// and runs whether the loader hands us the value or a `{ default }` wrapper.
type AjvInstance = {
  compile: (schema: SchemaObject) => ValidateFunction;
};
type AjvCtor = new (opts?: Record<string, unknown>) => AjvInstance;
const unwrap = <T>(m: T): T => (m as { default?: T }).default ?? m;
const Ajv2020 = unwrap(Ajv2020Default) as unknown as AjvCtor;
const addFormats = unwrap(addFormatsDefault) as unknown as (ajv: AjvInstance) => AjvInstance;

/** Thrown by the `assert*` helpers; carries Ajv's error list on `.errors`. */
export class InvoiceValidationError extends Error {
  readonly errors: ErrorObject[] | null | undefined;
  constructor(message: string, errors: ErrorObject[] | null | undefined) {
    super(message);
    this.name = "InvoiceValidationError";
    this.errors = errors;
  }
}

/** Recursively drop every `required` keyword (the array-valued schema keyword),
 *  returning a clone. A property literally named "required" whose value is a
 *  schema object is left intact. */
function stripRequired(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripRequired);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "required" && Array.isArray(v)) continue;
      out[k] = stripRequired(v);
    }
    return out;
  }
  return node;
}

const validateInvoiceSchema: ValidateFunction = addFormats(
  new Ajv2020({ strict: false, allErrors: true }),
).compile(invoiceSchema as SchemaObject);

/** Strict validation: the full schema, plus the cross-field checks.
 *
 *  Wraps Ajv's compiled function rather than replacing it so the contract
 *  callers rely on holds — `validateInvoice(x) === true` still means "this is
 *  acceptable", and `.errors` still carries an `ErrorObject[]`. The schema's
 *  own properties (`schema`, `schemaEnv`, …) are copied across so the wrapper
 *  remains a usable `ValidateFunction` for tooling that introspects them.
 *
 *  Both passes always run and their errors concatenate, matching the
 *  `allErrors: true` posture elsewhere: a caller fixing a payload should see
 *  everything wrong with it in one round trip, not one class at a time. */
export const validateInvoice: ValidateFunction = Object.assign(
  (data: unknown): boolean => {
    const schemaOk = validateInvoiceSchema(data);
    const schemaErrors = schemaOk ? [] : (validateInvoiceSchema.errors ?? []);
    const errors = [...schemaErrors, ...checkAdjustmentDerivations(data)];
    validateInvoice.errors = errors.length > 0 ? errors : null;
    return errors.length === 0;
  },
  validateInvoiceSchema,
) as ValidateFunction;

export const validatePartialInvoice: ValidateFunction = addFormats(
  new Ajv2020({ strict: false, allErrors: true }),
).compile(stripRequired(invoiceSchema) as SchemaObject);

/** Throw `InvoiceValidationError` unless `input` satisfies the full schema. */
export function assertValidInvoice(input: unknown): asserts input is EN16931SimplifiedInvoice {
  if (!validateInvoice(input)) {
    throw new InvoiceValidationError("Invalid invoice data", validateInvoice.errors);
  }
}

/** Throw `InvoiceValidationError` unless `input` satisfies the relaxed schema
 *  (types/patterns/enums enforced, nothing mandatory). */
export function assertPartialInvoice(input: unknown): void {
  if (!validatePartialInvoice(input)) {
    throw new InvoiceValidationError("Invalid invoice data", validatePartialInvoice.errors);
  }
}
