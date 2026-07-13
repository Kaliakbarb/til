# til — тіл

[![ci](https://github.com/Kaliakbarb/til/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaliakbarb/til/actions)
[![playground](https://img.shields.io/badge/playground-til--lang.vercel.app-2dd4bf)](https://til-lang.vercel.app)
[![game](https://img.shields.io/badge/flappy_bird-written_in_til-fbbf24)](https://til-lang.vercel.app/flappy.html)

**A scripting language engineered for AI agents.** The whole language fits in a
1,777-token prompt card, programs match Python on tokens (and cost ~40% fewer than JS),
hallucinated names are caught *before* execution, and every error is structured data
designed to be fed back to a model for one-shot self-repair.

```
read "input.txt" | lower | words | counts | top 5 | each {p -> print "{p.k} {p.v}"}
```

That's the whole word-frequency program. 30 tokens. The Python equivalent is 33; the JS is 98.

## The numbers (measured, not vibes)

10 typical agent tasks — file munging, JSON transforms, CSV aggregation, stats, algorithms —
written in idiomatic-minimal til, Python, and JS. All 30 programs produce **byte-identical
stdout** (verified by `npm run bench` on every run). Token counts via real tokenizers:

| | til | Python | JS |
|---|---:|---:|---:|
| o200k_base (GPT-4o/o-series) | **543** | 556 (til −2.3%) | 909 (til −40.3%) |
| cl100k_base (GPT-4) | **540** | 551 (til −2.0%) | 885 (til −39.0%) |

Full per-task table + fairness methodology: [bench/report.md](bench/report.md).
Honest caveat: Python is *extremely* token-efficient (tokenizers were trained on it),
and after an adversarial auditor pass re-optimized every Python/JS baseline (each
replacement byte-verified against reference output), til's edge over Python shrank
from the old headline of roughly one token in ten to −2.3% — parity, within noise. til wins the pipeline-shaped tasks
(−6% to −14%) and loses the control-flow-heavy ones (fizzbuzz +12%, fib +9%,
brackets +7%, inventory +4%). Also disclosed: til's own solutions were tuned while
the language was being designed, so this benchmark is in-sample for til. The token
table was never the pitch — the load-bearing wins are these:

| the actual cost centers for agents | til |
|---|---|
| teaching the model the language | **1,777 tokens once** (`til teach` → system prompt) |
| hallucinated import/identifier → wasted round-trip | killed statically by `til check`, with `didYouMean` |
| indentation/bracket corruption in patches | whitespace never significant; flat pipeline style |
| silent coercion bugs (`"1" + 1`) | impossible — typed errors with hints instead |
| unactionable stack traces | errors are JSON: code, line, source, locals, hint |
| tests drifting from code | `eg` assertions live next to the fn; `ensure` contracts always run |
| context cost of re-reading code | `til describe` emits a compact interface card |

## It's not just pipelines: Flappy Bird in til

**Play it: [til-lang.vercel.app/flappy.html](https://til-lang.vercel.app/flappy.html)** — the
real interpreter runs the game at 60fps in your tab, and the til source sits next to the
canvas, live-editable (change gravity, hit apply). The same game, same constants, same
mechanics ([games/flappy/SPEC.md](games/flappy/SPEC.md)) in three languages:

| | til (web host) | Python (pygame) | JS (canvas) |
|---|---:|---:|---:|
| o200k tokens | **645** | 810 (til −20.4%) | 777 (til −17.0%) |
| cl100k tokens | **645** | 808 (til −20.2%) | 758 (til −14.9%) |

The gap is *wider* than on the script benchmark: interactive programs are where init/event-loop
ceremony piles up. Fairness notes and per-implementation verification (til: a deterministic
2,000-frame autopilot run in [games/flappy/verify.mjs](games/flappy/verify.mjs); pygame: headless
scripted drive; js: stubbed-DOM frame pump) are in [games/flappy/tokens.md](games/flappy/tokens.md).
The host adds 7 builtins (`rect circle text pressed key width height`) via the public
`createRuntime({builtins})` extension point — the language core and its 1,777-token card are unchanged.

## Install / run

```bash
# from source (zero runtime dependencies, Node ≥ 18)
git clone https://github.com/Kaliakbarb/til && cd til
node bin/til repl
node bin/til run examples/report.til
node bin/til test tests/lang.til        # 234 eg assertions — the conformance suite
npm i && npm run bench                  # re-verify outputs + token counts yourself

# as a package (once published: npm publish from a logged-in account)
npm i -g til-lang && til repl
```

Scripts are shebang-able: start a file with `#!/usr/bin/env til`, `chmod +x`, run it.

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

Learn the rest in one sitting: [LLM.md](LLM.md) — it *is* the language, in 1,777 tokens.
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
  syntax: til was +78% vs Python's `statistics` module before; −10% after — one of the
  tasks til still wins against the adversarially-tightened baseline.

## The load-bearing experiment: `eval/` — measured

The expensive claim was: **a model that has never seen til writes it correctly from the
card alone.** Measured (2026-07-12, three Claude tiers, fresh isolated contexts holding
only the card + task, byte-exact stdout required — full methodology and caveats in
[eval/results.md](eval/results.md)):

| model | til from card, pass@1 | native Python, pass@1 | its own til vs its own Python (tokens) |
|---|---:|---:|---:|
| Fable 5 | **8/8** | 8/8 | **−15.2%** |
| Sonnet 5 | **8/8** | 8/8 | **−32.4%** |
| Haiku 4.5 | **8/8** | 8/8 | **−23.3%** |

Writing til from a 1.8k-token card was as reliable as writing native Python **down to
Haiku-class models** — the regime where unseen languages are supposed to collapse — and
every tier's naturally-written til was 15–32% smaller than its naturally-written Python
(hand-optimized ceilings are at parity; models don't write hand-optimized Python).
A rules-only half-card also scored 8/8. Honest limits: one model family so far, and the
benchmark saturated — the failure edge needs harder tasks. Cross-vendor replication:

```bash
EVAL_API_KEY=… EVAL_MODELS=openai/gpt-5-mini node eval/run.mjs   # any OpenAI-compatible endpoint
```

## What til is not (v0.2)

No regex, no async, no user modules, no classes, no package manager, no network.
It is a *task language*: the thing an agent writes in one shot, checks, runs, and throws away —
not the thing you build a service in. If a task needs those, use Python — the benchmark
harness here does.

## Repo map

```
src/til.mjs        the entire implementation: lexer → parser → checker → interpreter → CLI
                   (zero dependencies, runs in Node and the browser)
bin/til            CLI: repl · run · check · test · describe · teach · grammar · tokens
LLM.md             the prompt card (the language itself)
SPEC.md            normative semantics + design rationale
RESEARCH.md        the cited evidence base + prior-art landscape behind every design bet
ROADMAP.md         the measured path to v1.0: north-star metrics, kill criteria, eval v2
tests/lang.til     226-assertion conformance suite, written in til
examples/          hello · wordfreq · contracts · report · broken (error-UX demo)
bench/             10 tasks × 3 languages, output-verified token benchmark
                   (baselines adversarially optimized by an independent audit pass)
eval/              write-from-card vs native-python model eval (bring your own API key)
games/flappy/      the same Flappy Bird in til / pygame / canvas + verifiers + token table
web/               browser playground + the playable game
```

*тіл — "language" in Kazakh. Built 2026-07-12.*
