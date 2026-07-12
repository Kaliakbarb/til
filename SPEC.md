# til language specification — v0.1

til (тіл, Kazakh for "language/tongue") is a scripting language engineered for AI agents.
This document is the normative semantics. `LLM.md` is the same language compressed to a
prompt-sized card (~1.7k tokens); `src/til.mjs` is the reference implementation; `tests/lang.til`
is the executable conformance suite.

## 1. Design goals, each tied to a measured LLM failure mode

| # | Failure mode in LLM-generated code | til's answer |
|---|---|---|
| 1 | Hallucinated imports / module paths | **No imports.** One flat stdlib (~70 builtins), always in scope |
| 2 | Hallucinated identifiers & APIs | `til check` name-resolves *before* run; errors carry `didYouMean` |
| 3 | Indentation corruption (patches, deep nesting) | Whitespace is never significant; blocks are `{ }` |
| 4 | Silent type coercion masking bugs (`"1" + 1`) | No coercion, ever. Mixed `+` is an error with a hint |
| 5 | Arity mistakes | Fixed arity everywhere + currying; static arity warnings |
| 6 | Deep nesting → bracket mismatch | Pipeline style keeps code flat; one expression per line |
| 7 | Unactionable runtime errors | Errors are structured JSON: code, line, source, locals, hint, did-you-mean |
| 8 | Tests drift from code | `eg` assertions live next to the function; `ensure` contracts run always |
| 9 | Context cost of reading code | `til describe` emits a compact interface card; egs double as docs |
| 10 | Token cost of writing code | measured −10.5% vs Python, −45% vs JS on identical, output-verified tasks (`bench/`) |

Non-goals (v0.1): regex, async/concurrency, user modules, classes, exceptions-as-control-flow,
arbitrary-precision numbers, network IO.

## 2. Lexical structure

- Source is UTF-8. `#` starts a comment to end of line.
- Newlines separate statements. Newlines are *suppressed* inside `( )` and `[ ]`
  (so multi-line lists/groupings just work) but *kept* inside `{ }` (lambda and block bodies
  need them). A line starting with `|` or `catch` continues the previous expression.
- Numbers: `123`, `1_000`, `1.5`, `1.5e3` — IEEE-754 float64. Integral values display without `.0`.
- Strings: `"…"` with escapes `\n \t \r \\ \" \' \{ \}` and interpolation `{expr}` (full
  expressions, nesting and quotes allowed inside). `'…'` is raw: no escapes, no interpolation.
  Both may span lines.
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`.
- Keywords: `fn if elif else match for in while return ensure eg and or not true false null catch break continue`.
- Whitespace sensitivity exists in exactly two places, both to match LLM writing priors:
  1. `name[` / `name(` with **no space** = index / call-parens; with a space = juxtaposed
     list/group argument (`xs[0]` vs `f [1, 2]`).
  2. `f -1` (space before `-`, none after, literal number) passes **-1 as an argument**
     (Ruby's rule). `a - 1` and `a-1` are subtraction.

## 3. Grammar (informal EBNF)

```
program   := stmt*
stmt      := fn | assign | multiassign | "return" expr? | "ensure" expr | "eg" expr
           | "for" NAME "in" header block | "while" header block
           | "break" | "continue" | expr
fn        := "fn" NAME NAME* ( "=" expr | block )
assign    := target "=" expr             target := NAME | postfix "." NAME | postfix "[" expr "]"
multiassign := target ("," target)+ "=" expr ("," expr)+     # counts must match
block     := "{" stmt* "}"

expr      := pipe
pipe      := catch ("|" catch)*          # x | f a  ≡  (f a) x
catch     := or ("catch" or)*            # left tried; on error, right evaluated (lazy)
or        := and ("or" and)*             # short-circuit, returns operand
and       := not ("and" not)*
not       := "not" not | cmp
cmp       := add (("=="|"!="|"<"|"<="|">"|">=") add)? | add "in" add    # no chaining
add       := mul (("+"|"-") mul)*
mul       := unary (("*"|"/"|"%") unary)*
unary     := "-" unary | call
call      := postfix (postfix | NEGLIT)*     # juxtaposition, left-assoc, one arg at a time
postfix   := atom ("." NAME | "[" expr "]" | "(" ")" | "(" expr ("," expr)* ")")*
atom      := NUM | STR | RAW | NAME | "true" | "false" | "null"
           | "(" expr ")" | list | braced | ifexpr | matchexpr
list      := "[" (expr ("," expr)*)? "]"
braced    := "{}"                        → empty map
           | "{" (NAME|STR) ":" …        → map literal (`,` or newline separated)
           | "{" NAME* "->" stmt* "}"    → lambda with named params
           | "{" stmt* "}"               → lambda with implicit param `it`
ifexpr    := "if" header block ("elif" header block)* ("else" block)?
matchexpr := "match" header "{" (pattern ("if" expr)? "->" (expr|block))* "}"
pattern   := NUM | "-" NUM | STR | RAW | "true" | "false" | "null" | "_" | NAME
header    := expr                        # but `{` does not start an expression here
```

Inside a *header* (the condition/subject of `if`/`elif`/`while`/`for`/`match`), `{` always
opens the following block — wrap lambda arguments in parens there (Go has the same rule).

## 4. Semantics

**Types.** `num str bool null list map fn`. `type x` returns the name. Maps are insertion-ordered
with string keys; non-string keys coerce via display form (`m[1]` ≡ `m["1"]`). This map-key
stringification is til's *one* deliberate coercion (JSON alignment); it flows into `group`,
`counts`, and `top` — so `counts [1, "1"]` merges buckets while `uniq [1, "1"]` (which
type-tags) keeps both. Strings are sequences of Unicode **code points**: `len`, indexing,
`take/skip/get/pos/chars/rev` all agree ("😀🙂" has len 2 and never splits into surrogates).
Numbers ≥ 1e21 display in JS exponential form (documented papercut).

**Truthiness** (Python-aligned): `false`, `null`, `0`, `NaN`, `""`, `[]`, `{}` are falsy; all else truthy.

**Equality** `==` is deep structural equality across lists/maps; map order is ignored; no cross-type
equality (`1 != "1"`). `< <= > >=` require two nums or two strs. Comparison chaining is a syntax error.

**Arithmetic.** `+` is num+num, str+str, or list+list concat — nothing else. `- * / %` are
num-only. `/ 0` and `% 0` are errors (`E_DIV`). `%` is floored modulo (Python: `-7 % 3 == 2`).

**Assignment** rebinds the nearest enclosing binding of that name, else defines in the current
function scope (there is no shadowing between a function and its blocks; lambdas/fns introduce
scopes, blocks do not). Multi-assignment evaluates all right-hand values before assigning (swap-safe).

**Application & currying.** Every function has a fixed arity. Applying fewer args returns a
partial; more args apply to the returned value. Applying a non-function raises `E_APPLY`.
Zero-arg functions require `()`. Pipe `x | e` evaluates `e` then applies it to `x` (data-last).

**Mutation model.** Statements mutate: `m.k = v`, `xs[i] = v`, `push x xs`, `pop xs`.
Builtins otherwise return new values (`put`, `del`, `merge`, `sort`, …). Lists/maps are
reference values; `push` visibly mutates aliases.

**Control flow.** `if`/`match` are expressions; a block's value is its last expression
(`null` if the last statement isn't an expression, or the block is empty). `match` with no
matching case raises `E_MATCH` (add `_ ->`). A `match` binding pattern binds into the
*enclosing scope*, Python-3.10-style — the name persists after the match. A `{ … }`
case body is a block, except when it reads as a map literal or a `{params -> …}` lambda;
an implicit-`it` lambda there needs parens (`({it * 2})`) and the `it` error says so.
`for` iterates lists (live), string code points, and maps (as `{k, v}` items, a *copy* of
the entry list). `for` and `while` both carry a 10-million-iteration runaway guard (`E_LOOP`).
`return` exits the enclosing fn. Recursion is bounded by the host stack (several hundred
til frames, backstopped at 2000): exceeding it always raises a clean, catchable `E_STACK` —
never a raw host exception.

**Contracts & tests.** `ensure cond` raises `E_ENSURE` with a snapshot of current locals when
falsy — it runs in normal execution, not just tests. `eg expr` registers an assertion, run
*after* the whole file executes (so it observes final state); `eg a == b` failures report both
sides. **`til run` executes egs too** (CodeT-style: shipped tests run every time; failures go
to stderr and fail the exit code; `--no-eg` opts out). `til test` runs only the assertions.

**Errors.** All runtime errors are values of one shape and are interceptable by `expr catch fallback`
(the fallback is lazy). Uncaught errors carry: `code` (E_NAME, E_TYPE, E_APPLY, E_ARITY, E_INDEX,
E_DIV, E_MATCH, E_ENSURE, E_EMPTY, E_IO, E_JSON, E_NUM, E_MATH, E_STACK, E_LOOP, E_USER, E_SYNTAX),
message, file:line:col, the source line, `didYouMean` for unknown names, a `hint`, a `rule`
back-reference quoting the LLM.md rule that was violated, up to 8 locals of the innermost frame,
and the call stack. `--json` emits the same as machine-readable JSON — **on every path**: host
stack exhaustion is converted to `E_STACK`, cyclic-structure serialization to `E_JSON`, and
display/equality handle cycles (`<cycle>`), so no input can produce a raw host stack trace.

**Static checks** (`til check`, and automatically before `til run`): syntax; unknown names with
did-you-mean over builtins + everything in scope (assignment anywhere in a function counts for the
whole function, Python-style); `return`/`break`/`continue` placement; builtin over-application
warnings; builtin shadowing warnings. There is no type checker in v0.1 — contracts + egs + typed
runtime errors carry that weight.

## 5. Builtins

The normative list with signatures and one-line docs is `BUILTIN_SPECS` in `src/til.mjs`
(~70 entries; also rendered in LLM.md). Conventions: options first, data last; every collection
function is total over its documented types and raises `E_TYPE` otherwise; `first/last/get/pos/find`
return `null` for absence; `min/max/mean/median/stdev` raise `E_EMPTY` on `[]`; `sort/sortBy/top`
require homogeneous num or str keys and are stable.

## 6. The agent workflow (why this language exists)

```
til teach                 # ← paste this (~1.7k tokens) into the system prompt once
til grammar               # GBNF for constrained decoding (permissive superset)
write code
til check f.til --json    # hallucinated names die here, with didYouMean
       --strict           # additionally: every fn must ship an eg
       --no-io            # additionally: reject read/write/env/stdin (sandboxed runs)
til run f.til             # runs the program AND its egs; structured errors → self-repair
til describe f.til        # compact interface card for the next agent's context
```

## 7. Versioning

v0.1 froze after the benchmark loop (see bench/report.md). Anything not pinned by
`tests/lang.til` + this spec is implementation detail and may change.
