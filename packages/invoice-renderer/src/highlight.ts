// @facturion/invoice-renderer/highlight — mark validation findings on an
// invoice rendered with `annotate: true`, in the browser.
//
// The renderer leaves `data-path` on every rendered field and a hidden,
// labelled `data-slot` where an absent one would go. This module puts boxes
// on them: at rest every finding marks what it asks to fix (the most severe
// finding owns an element's colour), and a focused finding marks every field
// it involves, by role. The look is styles/highlight.css, themable through its
// `--inv-hl-*` tokens; the classes (`inv-hl`, `inv-hl--target`, …) are stable
// for a host that wants more.
//
// It takes fields as @facturion/rule-fields' `fieldsFor` returns them, but
// needs nothing from that package: any `{ role, state, pointer | list }` will do.

/** How bad a finding is; the most severe one marking an element colours it. */
export type Severity = "error" | "warning" | "information";

/** A field's part in a finding. */
export type HighlightRole = "target" | "condition" | "operand";

/** One field of a finding. */
export type HighlightField = {
  readonly role: HighlightRole;
  /** For a `missing-any` target: the group it satisfies (one per group will do). */
  readonly group?: string;
} & (
  /** A place in the invoice, holding a value or where the missing one would go. */
  | { readonly state: "present" | "absent"; readonly pointer: string }
  /** A list lacking an entry the rule asks for. */
  | { readonly state: "add-entry"; readonly list: string }
);

export interface HighlightFinding {
  readonly severity: Severity;
  /** The rule's kind. For `missing-any` (one of several fields would do) the
   *  rest state shows one "missing" box per group, its first field the
   *  invoice has a place for; the focused finding shows them all. */
  readonly kind?: string;
  readonly fields: readonly HighlightField[];
}

export interface Highlighter {
  /** Redraw: every finding's rest marks, plus all of `focus`'s marks (an index
   *  into the findings), or none. */
  show(focus?: number | null): void;
  /** The findings marking `el` (or the nearest marked element containing
   *  it), most severe first: for a tooltip, or to focus one on click. */
  findingsAt(el: Element): number[];
  /** The fields of a finding with no place on the rendered invoice (fields an
   *  invoice doesn't print, like the specification identifier), to list
   *  beside it. */
  offInvoice(finding: number): HighlightField[];
  /** Remove every mark and hide the revealed slots again. */
  clear(): void;
}

/** How a field was found on the page: its own element, the slot where it
 *  would go, or (neither rendered) the nearest rendered container. */
type Located = { readonly el: HTMLElement; readonly how: "exact" | "slot" | "ancestor" };

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { information: 0, warning: 1, error: 2 };
const CLASSES = [
  "inv-hl", "inv-hl--rest", "inv-hl--target", "inv-hl--condition", "inv-hl--operand", "inv-hl--approx",
  "inv-hl--focus", "inv-hl--error", "inv-hl--warning", "inv-hl--information", "inv-slot--shown",
] as const;

const quote = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;
const parent = (p: string) => p.replace(/\/[^/]*$/, "");
const pointerOf = (f: HighlightField) => (f.state === "add-entry" ? f.list : f.pointer);

/** Mark `findings` on the invoice rendered (with `annotate: true`) inside
 *  `root`. Nothing is drawn until `show()`. */
export function highlight(root: ParentNode, findings: readonly HighlightFinding[]): Highlighter {
  const byElement = new Map<Element, Set<number>>();
  const severityOf = new Map<Element, Severity>();

  const one = (attr: "data-path" | "data-slot", p: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(attr === "data-path" ? `[data-path~=${quote(p)}]` : `[data-slot=${quote(p)}]`);

  function locate(p: string): Located | null {
    const exact = one("data-path", p);
    if (exact) return { el: exact, how: "exact" };
    const slot = one("data-slot", p);
    if (slot) return { el: slot, how: "slot" };
    // Not rendered: the slot of a containing object (a missing card holds its
    // missing holder name), else the nearest rendered container.
    for (let q = parent(p); q; q = parent(q)) {
      const s = one("data-slot", q);
      if (s) return { el: s, how: "slot" };
      const c = one("data-path", q);
      if (c) return { el: c, how: "ancestor" };
    }
    return null;
  }

  /** The element's colour, unless a more severe finding already owns it. */
  function claim(el: Element, severity: Severity, force: boolean): boolean {
    const current = severityOf.get(el);
    if (!force && current && SEVERITY_RANK[current] > SEVERITY_RANK[severity]) return false;
    severityOf.set(el, severity);
    el.classList.remove("inv-hl--error", "inv-hl--warning", "inv-hl--information");
    el.classList.add(`inv-hl--${severity}`);
    return true;
  }

  function index(el: Element, i: number) {
    let s = byElement.get(el);
    if (!s) byElement.set(el, (s = new Set()));
    s.add(i);
  }

  function reveal(slot: HTMLElement) {
    slot.hidden = false;
    slot.classList.add("inv-slot--shown");
  }

  function clear() {
    for (const el of root.querySelectorAll<HTMLElement>("[data-path], [data-slot]")) {
      el.classList.remove(...CLASSES);
      if (el.hasAttribute("data-slot")) el.hidden = true;
    }
    byElement.clear();
    severityOf.clear();
  }

  /** What a finding marks at rest: what it asks to fix, or, for a comparison
   *  with nothing derived to fix, its operands. */
  function restFields(f: HighlightFinding): readonly HighlightField[] {
    const targets = f.fields.filter((x) => x.role === "target");
    return targets.length ? targets : f.fields.filter((x) => x.role === "operand");
  }

  function show(focus: number | null = null) {
    clear();
    findings.forEach((f, i) => {
      // missing-any: one box per group, so three boxes don't read as three
      // missing fields when any one would do. The table's order is preference.
      const boxed = new Set<string>();
      for (const field of restFields(f)) {
        const loc = locate(pointerOf(field));
        if (!loc) continue;
        index(loc.el, i);
        if (loc.how === "exact") {
          if (claim(loc.el, f.severity, false)) loc.el.classList.add("inv-hl", "inv-hl--rest");
        } else if (loc.how === "slot" && field.state !== "present") {
          if (f.kind === "missing-any") {
            const group = field.group ?? "";
            if (boxed.has(group)) continue;
            boxed.add(group);
          }
          if (claim(loc.el, f.severity, false)) {
            reveal(loc.el);
            loc.el.classList.add("inv-hl", "inv-hl--rest", `inv-hl--${field.role}`);
          }
        }
      }
    });
    const f = focus === null ? undefined : findings[focus];
    if (focus === null || !f) return;
    for (const field of f.fields) {
      const loc = locate(pointerOf(field));
      if (!loc) continue;
      index(loc.el, focus);
      claim(loc.el, f.severity, true);
      if (loc.how === "slot") reveal(loc.el);
      const kind = loc.how === "ancestor" && field.role === "target" ? "approx" : field.role;
      loc.el.classList.remove("inv-hl--rest", "inv-hl--target", "inv-hl--condition", "inv-hl--operand", "inv-hl--approx");
      loc.el.classList.add("inv-hl", "inv-hl--focus", `inv-hl--${kind}`);
    }
  }

  function findingsAt(el: Element): number[] {
    // The nearest marked element at or above `el` (a pointer over a label
    // inside a marked row means the row).
    let at: Element | null = el;
    while (at && !byElement.has(at)) at = at.parentElement;
    const found = at ? [...(byElement.get(at) ?? [])] : [];
    return found.sort((a, b) => {
      const fa = findings[a], fb = findings[b];
      return (fb ? SEVERITY_RANK[fb.severity] : 0) - (fa ? SEVERITY_RANK[fa.severity] : 0) || a - b;
    });
  }

  function offInvoice(i: number): HighlightField[] {
    return (findings[i]?.fields ?? []).filter((x) => !locate(pointerOf(x)));
  }

  return { show, findingsAt, offInvoice, clear };
}
