# til — тіл

**A scripting language engineered for AI agents.** The whole language fits in a
1,728-token prompt card, programs cost measurably fewer tokens than Python or JS,
hallucinated names are caught *before* execution, and every error is structured data
designed to be fed back to a model for one-shot self-repair.

```
read "input.txt" | lower | words | counts | top 5 | each {p -> print "{p.k} {p.v}"}
```

That's the whole word-frequency program. 30 tokens. The Python equivalent is 36; the JS is 106.

## The numbers (measured, not vibes)

10 typical agent tasks — file munging, JSON transforms, CSV aggregation, stats, algorithms —
written in idiomatic-minimal til, Python, and JS. All 30 programs produce **byte-identical
stdout** (verified by `npm run bench` on every run). Token counts via real tokenizers:

| | til | Python | JS |
|---|---:|---:|---:|
| o200k_base (GPT-4o/o-series) | **543** | 607 (til −10.5%) | 990 (til −45.2%) |
| cl100k_base (GPT-4) | **540** | 598 (til −9.7%) | 964 (til −44.0%) |

Full per-task table + fairness methodology: [bench/report.md](bench/report.md).
Honest caveat: Python is *extremely* token-efficient (tokenizers were trained on it).
til beats it by winning the pipeline tasks (−12% to −36%) and refusing to lose the
rest. The bigger wins are elsewhere:

| the actual cost centers for agents | til |
|---|---|
| teaching the model the language | **1,728 tokens once** (`til teach` → system prompt) |
| hallucinated import/identifier → wasted round-trip | killed statically by `til check`, with `didYouMean` |
| indentation/bracket corruption in patches | whitespace never significant; flat pipeline style |
| silent coercion bugs (`"1" + 1`) | impossible — typed errors with hints instead |
| unactionable stack traces | errors are JSON: code, line, source, locals, hint |
| tests drifting from code | `eg` assertions live next to the fn; `ensure` contracts always run |
| context cost of re-reading code | `til describe` emits a compact interface card |

## Install / run

```bash
git clone … && cd til     # zero runtime dependencies, Node ≥ 18
node bin/til run examples/report.til
node bin/til test tests/lang.til        # 226 eg assertions — the conformance suite
npm run bench                           # re-verify outputs + token counts yourself
```

## Thirty seconds of til

```
# no imports — ~70 builtins are always in scope, there is nothing else
sales = read "sales.csv" | lines | skip 1 | map (split ",")

# pipes pass the value as the LAST argument; every fn is curried
for p in (group {it[0]} sales) {
  print "{p.k}: {p.v | map {num it[1]} | sum}"
}

fn fib n {
  ensure n >= 0                    # contract: fails loudly, with locals attached
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
eg fib 10 == 55                    # inline test AND documentation

a, b = 0, 1                        # simultaneous assignment
data = json (read "cfg.json") catch {}    # any error → inline fallback
```

Learn the rest in one sitting: [LLM.md](LLM.md) — it *is* the language, in 1,728 tokens.
Full semantics + design rationale: [SPEC.md](SPEC.md).

## The agent loop this language is built for

```bash
til teach                    # print LLM.md — paste into the system prompt once
# ... model writes task.til ...
til check task.til --json    # {"code":"E_NAME","msg":"unknown name `itmes`","didYouMean":["items"],…}
til run task.til             # runtime errors carry locals + hints, same JSON shape
til test task.til            # runs the eg assertions the model wrote
til describe task.til        # compressed interface card for the next context window
```

Every design decision maps to a measured LLM failure mode — the table is in
[SPEC.md §1](SPEC.md). Three examples:

- **`f -1` passes −1 as an argument** (Ruby's whitespace rule). Why: while writing this
  project's own test suite, the LLM authoring it hit the `abs -3` footgun twice. Measured
  failure → syntax rule.
- **`push`/`pop` mutate.** Purity lost to a measurement: `stack = take (len stack - 1) stack`
  cost 9 tokens where Python's `stack.pop()` cost 3, and models *expect* mutation here.
- **`mean/median/stdev/top` are builtins.** The stats benchmark showed batteries beat
  syntax: til was +78% vs Python's `statistics` module before, −15% after.

## The load-bearing experiment: `eval/`

Token counts are the cheap claim. The expensive claim is: **a model that has never
seen til writes it correctly from the 1,728-token card alone.** `eval/run.mjs` measures
exactly that against any OpenAI-compatible endpoint: 8 unseen tasks, model gets only
LLM.md + the task, temperature 0, stdout must match byte-exactly, one structured-error
repair round (which tests the self-repair design too) — side by side with the same
model writing native Python.

```bash
EVAL_API_KEY=… EVAL_MODELS=anthropic/claude-sonnet-5 node eval/run.mjs   # → eval/results.md
```

All 8 tasks have verified reference solutions in til (`eval/reference/`). No key on
this machine yet, so no numbers are claimed here — run it before believing anyone.

## What til is not (v0.1)

No regex, no async, no user modules, no classes, no package manager, no network.
It is a *task language*: the thing an agent writes in one shot, checks, runs, and throws away —
not the thing you build a service in. If a task needs those, use Python — the benchmark
harness here does.

## Repo map

```
src/til.mjs        the entire implementation: lexer → parser → checker → interpreter → CLI
                   (zero dependencies, runs in Node and the browser)
bin/til            CLI: run · check · test · describe · teach · grammar · tokens
LLM.md             the prompt card (the language itself)
SPEC.md            normative semantics + design rationale
tests/lang.til     226-assertion conformance suite, written in til
examples/          hello · wordfreq · contracts · report · broken (error-UX demo)
bench/             10 tasks × 3 languages, output-verified token benchmark
web/               browser playground
```

*тіл — "language" in Kazakh. Built 2026-07-12.*
