// @facturion/rule-fields — which invoice fields an e-invoicing validation rule
// concerns (EN 16931, XRechnung, the French CTC rules, …), and the matching
// that turns a finding into those fields. The tables are in tables/*.json.

export { loadTable, mergeTables, TableError, KINDS, ROLES, SYNTAXES } from "./table.js";
export type { FieldSpec, Kind, Mapping, Role, RuleEntry, RuleTable, Syntax } from "./table.js";
export { fieldsFor } from "./fields.js";
export type { FieldResult, Finding, FindingFields } from "./fields.js";
