# JSON Pointer patterns — draft 1

A pattern describes a set of places in a JSON document, including places
that don't exist yet ("where a missing field or entry would go"). Patterns
are a **strict superset of JSON Pointer** ([RFC 6901]): every JSON Pointer is
a pattern that matches exactly itself. Matching always yields concrete JSON
Pointers.

Purpose: map a validation rule to the fields it concerns, in a table that is
independent of any one document, then resolve the table against a document
and an *anchor* (the pointer of the object the rule fired on).

## 1. Syntax

```abnf
pattern         = absolute / relative
absolute        = *( "/" segment )                    ; "" = the whole document
relative        = non-negative-integer absolute       ; see §2.5
non-negative-integer = "0" / ( %x31-39 *DIGIT )

segment         = reference-token / any / this / filter

; RFC 6901, unchanged
reference-token = *( unescaped / escaped )
unescaped       = %x00-2E / %x30-7D / %x7F-10FFFF     ; not "/" or "~"
escaped         = "~" ( "0" / "1" )                   ; "~" and "/"

; Extensions. RFC 6901 allows "~" only before "0" or "1", so none of these
; is a valid JSON Pointer token: they can never collide with a real key.
any             = "~*"
this            = "~."
filter          = "~?" member ( "=" / "!=" ) value / absent
absent          = "~?!" member                      ; entries without the member
member          = member-key *( "~1" member-key )   ; "~1" separates nested steps
member-key      = 1*( member-char / "~0" / "~2" / "~3" )  ; "~2" = "=", "~3" = "!"
member-char     = %x00-20 / %x22-2E / %x30-3C / %x3E-7D / %x7F-10FFFF   ; not "!", "/", "~", "="
value           = reference-token
```

Escapes are decoded per token after splitting on `/`, `~1` before `~0`
(RFC 6901 §4). In `member`, `~1` separates the steps of a nested member,
`~2` decodes to `=` and `~3` to `!`; anywhere else `~2` and `~3` are an
error. A pattern that doesn't match the grammar is an error, not an empty
match.

## 2. Matching

`match(pattern, document, anchor?)` returns an ordered list of results, each
one of two kinds:

- a **place**: a JSON Pointer (RFC 6901) and whether it resolves in the
  document. A place that doesn't resolve is where the missing value would go.
- an **entry to add**: a list's pointer, and the member and value a filter
  asked for (§2.4) when no entry of the list has it.

In the test vectors a result is written as JSON: `{pointer, exists}` for a
place, `{pointer, exists: false, entry: {member, value}}` for an entry to add
(a nested member's steps joined by `/`). The TypeScript API returns
`{kind: "place", pointer, exists}` and `{kind: "add-entry", list, member, value}`.

Evaluation walks the segments left to right over a set of *positions*, each a
concrete pointer that may or may not exist. It starts with the single
position `""`. Results keep document order: positions from one segment are
expanded in array index order.

### 2.1 Reference token

Appends the token. The new position exists iff the old one exists and is an
object with that member, or an array and the token is an index in range
(RFC 6901 §4: `0` or no leading zero; `-` never exists).

A position that doesn't exist stays in the set: `/seller/address/city` on a
document without an address yields `{pointer: "/seller/address/city",
exists: false}`. That is "where the missing field would go".

### 2.2 `~*` — every item

Replaces the position with one position per element of the array at that
position, in index order. If the position doesn't exist or isn't an array,
it yields nothing.

### 2.3 `~.` — the anchor's item

If the anchor has an array index at this depth, and the anchor *agrees*
with the position so far, `~.` takes that index (whether or not it exists in
the document). Otherwise it behaves like `~*`.

The anchor agrees when every earlier segment, at the same depth, is either a
reference token equal to the anchor's token, or `~*` / `~.` / `~?…` and the
anchor's token is an array index.

So `/lines/~./period` with anchor `/lines/3/item` yields `/lines/3/period`;
with anchor `/payment` it yields every line's period.

### 2.4 `~?member=value` — matching entries

At an array: one position per element that is an object whose `member` is a
string equal to `value`, in index order. A nested member (`vat~1category_code`)
is followed step by step through objects: the entry's `vat`, then its
`category_code`. A key containing `/` can't be a member step.

If no element matches (including: the position doesn't exist or isn't an
array), the result is a single **terminal** result for the array itself:

```json
{ "pointer": "/lines/0/item/attributes", "exists": false,
  "entry": { "member": "name", "value": "cva" } }
```

(A nested member is reported with its steps joined by `/`: `"vat/category_code"`.)

`exists` is false because the *entry* doesn't exist; the array may well
exist. That is "where an entry would be added". Remaining segments are not
evaluated for that position, since there is nothing to descend into.

Values compare as strings only: a member holding the number `3` never
equals `"3"`.

### 2.4a `~?member!=value` — entries that differ

At an array: one position per element that is an object whose `member` is a
string *not* equal to `value`, in index order. An element without the
member, or whose member isn't a string, doesn't match (as XPath's `!=` is
false for an absent node).

If no element matches, there is no result: nothing is missing, so there is
no place to add one.

### 2.4b `~?!member` — entries without the member

At an array: one position per element that is an object whose `member` is
absent: the key is missing, or its value is `null`. A nested member is absent
when any step is missing, `null`, or not an object. An empty string counts as
present (it is a value; whether it may be empty is another rule's business).
Elements that aren't objects never match.

If no element matches, there is no result: nothing is missing.

So `/seller/identifiers/~?!scheme_id/scheme_id` is the `scheme_id` of
exactly the identifiers that have none, each with `exists: false`: where the
missing field would go.

### 2.5 Relative patterns

`N/rest` is [Relative JSON Pointer] without its `#` and index-offset
forms: drop `N` tokens from the end of the anchor, and evaluate `rest`
below what remains. Equivalently, it's the absolute pattern formed by the
remaining anchor tokens (as literal reference tokens) followed by `rest`. So
`0/scheme_id` with anchor `/lines/2/item/classifications/0` is
`/lines/2/item/classifications/0/scheme_id`, and `0` alone is the anchor.

Without an anchor, or if `N` exceeds the anchor's length, a relative pattern
yields nothing.

## 3. Other operations

| Function | Purpose |
|---|---|
| `parsePattern(pattern)` | The parsed pattern, or an error naming the offset. Parse once and match many times. |
| `pointer(string)` | Check a string is a JSON Pointer. |
| `get(document, pointer)` | RFC 6901 evaluation; `undefined` when absent. |
| `isPrefix(a, b)` | Pointer `a` is `b` or an ancestor of it (token-wise, so `/line` is not a prefix of `/lines`). |

## 4. Not covered (on purpose)

- Comparisons other than string equality and inequality; several conditions
  per filter. RFC 9535 has these; nothing needs them yet, and each would be
  an additive token.
- `~*` over object members. Arrays only.
- Relative JSON Pointer's `#` (key name) and `+1`/`-1` index offsets.

[RFC 6901]: https://www.rfc-editor.org/rfc/rfc6901
[Relative JSON Pointer]: https://datatracker.ietf.org/doc/html/draft-bhutton-relative-json-pointer-00
