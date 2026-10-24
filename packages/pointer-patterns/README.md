# @facturion/pointer-patterns

JSON Pointer patterns: a strict superset of [JSON Pointer (RFC 6901)] that
names a *set* of places in a JSON document, including places that don't exist
yet. Matching a pattern against a document always yields concrete JSON
Pointers.

Built to map validation rules to the fields they concern: a table of patterns,
independent of any one document, resolved against a document and an *anchor*,
the pointer of where a rule fired. The full grammar and semantics are in
[SPEC.md](SPEC.md); [`vectors.json`](test/vectors.json) holds language-neutral
test vectors written from it.

```sh
npm install @facturion/pointer-patterns
```

## Syntax at a glance

| Pattern | Means |
|---|---|
| `/seller/vat_id` | A JSON Pointer: exactly that place, whether it exists or not. |
| `/lines/~*/net_amount` | Every line's net amount. |
| `/lines/~./period` | The period of the line the anchor is in (every line's, if the anchor is in none). |
| `/item/attributes/~?name=cva` | The attributes named `cva`; if there are none, the list as the place to add one. |
| `/lines/~?vat~1category_code=S/net_amount` | The net amounts of the lines whose `vat.category_code` is `S`. |
| `/notes/~?subject_code!=AAK` | The notes with another subject code. |
| `/seller/identifiers/~?!scheme_id/scheme_id` | The missing scheme of exactly the identifiers that have none. |
| `0/scheme_id` | Relative to the anchor ([Relative JSON Pointer]). |

The extension tokens all begin with an escape RFC 6901 forbids (`~` before
anything but `0` or `1`), so they can never collide with a real key.

## Usage

```ts
import { match, parsePattern, pointer } from "@facturion/pointer-patterns";

const doc = { lines: [{ period: { start_date: "2026-03-01" } }, {}] };

match("/lines/~./period/end_date", doc, pointer("/lines/1/net_amount"));
// → [{ kind: "place", pointer: "/lines/1/period/end_date", exists: false }]

match("/lines/~?id=7", doc);
// → [{ kind: "add-entry", list: "/lines", member: ["id"], value: "7" }]

// Parse once (a malformed pattern throws PatternSyntaxError with its offset),
// match many times.
const p = parsePattern("/lines/~*/period");
```

- **`match(pattern, document, anchor?)`** → results in document order: a
  `place` (a pointer, and whether it resolves) or an `add-entry` (a filter
  matched no entry of the list).
- **`parsePattern(source)`** → the parsed `Pattern`, or a `PatternSyntaxError`.
- **`pointer(string)`** → a checked `JsonPointer`. Anchors and results are
  `JsonPointer`, a branded string, so an unchecked string can't be passed
  where a pointer is expected.
- **`get(document, pointer)`**, **`isPrefix(a, b)`**, **`tokens(pointer)`**,
  **`fromTokens(tokens)`**: RFC 6901 helpers.

[JSON Pointer (RFC 6901)]: https://www.rfc-editor.org/rfc/rfc6901
[Relative JSON Pointer]: https://datatracker.ietf.org/doc/html/draft-bhutton-relative-json-pointer-00
