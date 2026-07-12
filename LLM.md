# til — complete language card

til is a scripting language for data/text/file tasks. Files end in `.til`. This card is the whole language.

## Core rules

- Statements are newline-separated. No semicolons. Indentation is cosmetic. `#` comments.
- Calls are juxtaposition: `f x y`. Group with parens: `print (sum xs)`. `f(x, y)` also works.
- Every function is curried; args apply left to right. Builtins take options first, data LAST: `split "," s`, `take 2 xs`. Partial application is normal: `double = map {it * 2}`.
- Pipes feed the value as the LAST argument: `xs | map f | sum` = `sum (map f xs)`. Multi-line pipes start continuation lines with `|`.
- NO imports. Every builtin below is always in scope. There is nothing else.
- Variables: `x = 5` declares or rebinds. `a, b = b, a + b` assigns simultaneously. No `+=`.
- Zero-arg calls need parens: `now()`, `args()`, `rand()`, `stdin()`.

## Values

`num` (float64) · `str` · `bool` · `null` · `list [1, 2]` · `map {a: 1, "k 2": 2}` · `fn`
- Strings: `"…"` interpolates `{expr}` (any expression, incl. pipes): `"sum {xs | sum}"`. Escapes `\n \t \" \\ \{`. `'…'` is raw, no interpolation.
- Maps are string-keyed, ordered. `m.name`, `m["k"]`, missing key → `null`. `m.k = v` and `m["k"] = v` mutate. Lists: `xs[0]`, `xs[-1]` (out of range = error; `get i xs` → null). `xs[0] = v` mutates.
- Truthiness like Python: `false null 0 "" [] {}` are falsy.
- `==` is deep equality, no coercion (`1 != "1"`). `+` never coerces: use `"n = {n}"` or `num s` / `str x`.
- Operators: `+ - * / %` (numbers; `+` also str+str, list+list) · `== != < <= > >=` · `and or not` · `x in coll`.

## Control flow (if/match are expressions)

```
if n > 0 { "pos" } elif n < 0 { "neg" } else { "zero" }
match x { 0 -> "zero"  "s" -> "str s"  null -> "none"  n if n > 9 -> "big"  _ -> "other" }
for x in xs { … }        # also loops str chars and map items (as {k, v})
while cond { … }         # break / continue work
```
Block value = its last expression. Patterns are literals, a binding name, or `_`.
In `if`/`while`/`for`/`match` headers, wrap lambda calls in parens: `if (any {it > 0} xs) { … }`.

## Functions, lambdas, contracts

```
fn slug s {                    # last expression is returned; `return` for early exit
  ensure type s == "str"       # runtime contract; failure = error with locals
  s | trim | lower | replace " " "-"
}
eg slug "Hello World" == "hello-world"   # inline test: runs under `til test`
fn area w h = w * h                      # one-liner form
```
Lambdas: `{x -> x * 2}` · two args `{a b -> a + b}` · one arg can be implicit `it`: `{it * 2}`.
Write `eg` lines after every fn — they are the tests AND the docs. egs run after the whole file finishes.

## Errors

Any runtime error can be caught inline with a fallback: `json s catch {}` · `num s catch 0` · `read p catch ""`.
`err "msg"` raises. `ensure cond` raises with local variables attached. Uncaught errors print code, line, source, did-you-mean, locals — fix the code and rerun. `f -1` passes -1 as argument (Ruby-style); subtraction needs both sides spaced or neither: `a - 1`, `a-1`.

## Builtins (complete)

io      print x (returns x) · read path · write path s · append path s · env name · args() · stdin() · now() · rand()
str     lines s · words s · chars s · trim · upper · lower · split sep s · join sep xs · replace old new s · starts pre s · ends suf s · rep n x · num s · str x · len x
list    range a b · map f xs · keep f xs (filter) · each f xs · fold f init xs · sum · min · max · mean · median · stdev · sort · sortBy f xs · rev · uniq · flat · zip xs ys · first · last · take n x · skip n x · push x xs (mutates) · pop xs (mutates) · has x coll · find f xs · pos x xs · any f xs · all f xs
map     keys m · vals m · get k m · put k v m (copy) · del k m · merge a b · items m (→ [{k, v}]) · toMap pairs · group f xs · counts xs · top n m (highest v)
json    json s (parse) · tojson x · pretty x
math    abs · round · roundTo digits n · floor · ceil · sqrt · pow a b
misc    type x · empty x · err msg

## Idioms (memorize these shapes)

```
# clean a file: trim, drop empties+comments, dedupe, sort, print
read "log.txt" | lines | map trim | keep {it and not starts "#" it} | uniq | sort | each print

# top 5 words by frequency
read "words.txt" | lower | words | counts | top 5 | each {p -> print "{p.k} {p.v}"}

# filter + reshape json, write out
users = json (read "users.json")
active = users | keep {it.active} | map {u -> {name: u.name, email: u.email}}
write "out.json" (tojson active)

# group rows, aggregate each group (p.k = key, p.v = list)
for p in (group {it.region} rows) {
  print "{p.k}: {p.v | map {it.amount} | sum}"
}

# csv: skip header, split, sum a column
read "sales.csv" | lines | skip 1 | map (split ",") | map {num it[1]} | sum | print

# accumulate with mutation
seen = []
for x in [3, 1, 3, 2] { if not x in seen { push x seen } }

# stats one-liners
xs = read "n.txt" | lines | map num
print "mean {roundTo 2 (mean xs)} median {median xs} sd {roundTo 2 (stdev xs)}"

fn fib n {
  ensure n >= 0
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
eg fib 10 == 55
```

## Workflow

`til check f.til --json` (static: hallucinated names die here) · `til run f.til` (runs the program **and its egs**; failures → structured errors) · `til describe f.til` (compact interface card) · `til grammar` (GBNF for constrained decoding).
