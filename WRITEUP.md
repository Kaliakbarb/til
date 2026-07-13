# We built a programming language for LLMs in a day — and measured everything

*til (тіл — "language" in Kazakh) · 2026-07-12 · [repo](https://github.com/Kaliakbarb/til) ·
[playground](https://til-lang.vercel.app) · [Flappy Bird written in it](https://til-lang.vercel.app/flappy.html)*

## The bet

Programming languages are designed for human writers. But an increasing share of code is
written by models, whose failure modes are nothing like ours: they hallucinate imports
(~20% of package recommendations across 16 models — USENIX'25), fumble undefined names
(the #1 static error class in 1M sampled completions — ACL'23), and repair their own bugs
exactly as well as their error messages allow (feedback quality is *the* self-repair
bottleneck — ICLR'24). Meanwhile every token an agent writes costs money and latency.

til's design bet: a language whose **entire specification is a prompt** (1,777 o200k
tokens — rules, all ~75 builtins, idioms), whose semantics **never contradict a model's
training priors** (models collapse to near-chance on counterfactual conventions —
NAACL'24: so 0-indexing, Python truthiness, C operators, floored `%`), with a **closed
world of names** (no import mechanism exists — the hallucination class is deleted, not
mitigated), **inline tests as one-token syntax** (`eg` — model-emitted tests are worth
+19–46 pass@1 in the literature), and **errors engineered as repair prompts** (stable
codes, source line, locals snapshot, did-you-mean, and a citation of the violated spec
rule, all as JSON). The full evidence audit, with citations and the counter-arguments
faced honestly, is [RESEARCH.md](RESEARCH.md).

The implementation is one dependency-free JavaScript file — lexer, parser, static
checker, interpreter, REPL, CLI — that runs in Node and in a browser tab. 234-assertion
conformance suite. CI green on Linux/macOS/Windows.

## What measurement did to the design

We benchmarked from hour one: 10 agent-typical tasks in til, Python, and JS, where
**token counts only count if all three produce byte-identical stdout**. The first
result was humbling — til *lost* to Python by 7%. The measurements said why: Python's
`statistics` module, `Counter.most_common`, tuple-swap, `stack.pop()`. So the design
iterated *on evidence*: `mean/median/stdev/top` builtins, mutating `push`/`pop`,
multi-assignment, `elif`. til then "won" −10.5%.

Then we paid an adversary to break our own benchmark. It shortened 14 of our 20
Python/JS baselines (byte-identical, idiomatic) and the headline **collapsed to −2.3% —
parity**. We published the collapse ([bench/report.md](bench/report.md)). The −40% vs JS
survived. Two lessons: Python is the tokenizer's home turf and essentially unbeatable at
hand-optimized ceilings; and any benchmark where the language designer writes all three
solutions is in-sample until audited.

But hand-optimized ceilings turned out to be the wrong frame — see the eval below.

Separately, an adversarial review of the interpreter found three crash classes (cyclic
structures, deep recursion outrunning the guard, unbounded `for`) that could produce raw
host stack traces — fatal for a language whose contract is "every error is structured
JSON." All fixed and pinned in the conformance suite; no input can now escape the error
model.

## The game

Token economy on scripts is one thing; interactive programs are where ceremony piles up.
We locked a Flappy Bird spec (constants, mechanics, states) and implemented it three
ways: til on a 7-builtin canvas host, Python on pygame, JS on raw canvas. Verified (til:
a deterministic 2,000-frame autopilot that scores, dies, and restarts), then measured:
**til 645 · pygame 810 (−20%) · canvas JS 777 (−17%)**. It's playable, with the til
source live-editable next to the canvas.

## The eval: can models actually write it?

The load-bearing question. Protocol: fresh, isolated model contexts containing **only
the card and a task**; 8 unseen tasks; byte-exact stdout required; native Python as the
control; three model tiers. (Run via isolated subagents of one model family — Claude
Fable/Sonnet/Haiku — the harness for cross-vendor HTTP replication ships in `eval/`.)

**Result: 8/8 pass@1 on every row** — til-from-card matched native Python down to
Haiku-class models, the regime where the MultiPL-E literature says unseen languages
collapse. A rules-only half-card also went 8/8. And the models' *own* programs measured
what hand-optimization hid: **their til was 15–32% smaller than their Python** (Fable
−15%, Sonnet −32%, Haiku −23%) — because models write defensive, verbose Python, and
til's pipeline register doesn't leave room for ceremony. Full numbers and honest limits
(one family; the benchmark saturated — the failure edge needs harder tasks) in
[eval/results.md](eval/results.md).

One detail worth more than the aggregate: a builtin (`rmatch`) added to the card two
hours before the eval was used correctly, raw-string idiom and all, by a model that had
never seen it. The card works as a live API surface.

## The three-layer token story (all measured, all published)

| layer | result |
|---|---|
| hand-optimized ceiling, output-verified, adversarially audited | til ≈ Python (−2.3%) · til ≪ JS (−40%) |
| model-written practice, three tiers | til −15% to −32% vs the same model's Python |
| interactive program (spec-locked game) | til −20% vs pygame, −17% vs canvas JS |

## What we'd tell someone building the next one

1. **Measure before believing yourself** — our first two headline numbers were both
   wrong, in opposite directions, and only adversarial passes found out.
2. **Copy semantics, invent structure.** Every surviving design deviation adds checkable
   structure (contracts, `eg`, closed names); every prior-contradicting idea died.
3. **The error message is the product.** Nothing else you control touches the repair
   loop as directly.
4. **Batteries beat syntax.** The benchmark moved when builtins landed, not when
   syntax got cleverer.
5. **The card is the distribution.** A language that travels inside a system prompt
   needs no package manager to reach every agent on earth.

## Status & what's next

v0.2.1: [GitHub](https://github.com/Kaliakbarb/til) (MIT, CI on 3 OSes), npm-ready
(`til-lang`), MCP server (sandboxed, zero-dep), Claude Code skill, VS Code grammar,
GBNF export for constrained decoding. Next: harder eval tasks to find the failure edge,
cross-vendor eval runs, `enum` (the one builtin real dogfooding demanded —
[scripts/FRICTION.md](scripts/FRICTION.md)), and an LSP when humans start writing it
by hand.
