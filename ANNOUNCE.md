# announcement drafts (post these yourself — nothing here auto-publishes)

## Show HN

**Title:** Show HN: til – a scripting language whose entire spec fits in a 1.8k-token prompt

**Body:**

I built a small scripting language designed for one user: LLM agents. The whole
specification — every rule, every builtin — is a 1,777-token markdown card (`til teach`).
You paste it into a system prompt and the model has the entire language in context; there
is nothing else to know. No imports exist, so there's nothing to hallucinate. Every
identifier is resolved statically before execution, with did-you-mean. Errors come back
as JSON with the source line, the local variables, a hint, and a reference to the exact
card rule you broke — built for the model to repair its own code in one round.

The part I'd most like scrutinized: the benchmark. I originally claimed −10.5% tokens vs
Python on 10 output-verified tasks. Then I had an independent adversarial pass try to
demolish my Python/JS baselines — it shortened 14 of 20, and the honest number collapsed
to −2.3% (parity). It's all published, including the collapse (bench/report.md). The −40%
vs JS survived. Where the token gap gets real is interactive programs: the same Flappy
Bird is 645 tokens in til vs 810 in pygame vs 777 in canvas JS — playable in the browser
with the source live-editable next to it.

Playground + game: https://til-lang.vercel.app · Repo (interpreter is one dependency-free
ESM file, 234-assertion conformance suite, CI on 3 OSes): https://github.com/Kaliakbarb/til
Every design decision is mapped to published evidence on LLM failure modes in RESEARCH.md.
Happy to be torn apart — that's been the development methodology so far.

## X / Twitter thread

1/ I built a programming language for AI agents. The entire spec is a 1,777-token prompt
card. Paste it into any model's context → it writes the language. No imports = nothing to
hallucinate. Errors are JSON designed for self-repair. Playable proof: Flappy Bird written
in it → til-lang.vercel.app/flappy.html

2/ The honest part: I claimed −10.5% tokens vs Python. Then I paid an adversarial audit
against my own benchmark. 14 of my 20 baselines fell. Real number: −2.3% (parity with
Python), −40% vs JS. Published the collapse. The game tells a different story though:
til 645 vs pygame 810 tokens.

3/ Every design choice is receipts-backed: package hallucination hits ~20% of samples
(USENIX'25) → no import system exists. Feedback quality is the self-repair bottleneck
(ICLR'24) → errors carry locals + did-you-mean + the violated spec rule. Inline tests are
worth +19-46 pass@1 (CodeT/TiCoder) → `eg` is one token and runs on every execution.

4/ One dependency-free file: lexer → parser → checker → interpreter. Runs in Node and in
your browser tab. REPL, MCP server, VS Code grammar, GBNF export for constrained decoding.
github.com/Kaliakbarb/til — break it, the error messages are the product.

## r/ProgrammingLanguages

**Title:** til: designing a language for LLM writers instead of human writers — with the
benchmark that survived (and the one that didn't)

**Body:** Human-first design says syntax should be expressive; LLM-first says semantics
must never contradict the model's training priors (models drop to coin-flip on 1-indexed
Python — NAACL'24), the whole language must fit in a context window, and error messages
are a repair-prompt API. til: juxtaposition calls, data-last pipes, Python truthiness,
`{ }` blocks with zero whitespace significance, contracts + inline `eg` tests as syntax,
closed world of ~75 builtins. Interpreter is one ESM file. What I want from this sub:
attack the semantics (SPEC.md) and the fairness methodology (bench/ — outputs must be
byte-identical before tokens count; baselines were adversarially optimized, which cost me
my favorite headline number). Repo: github.com/Kaliakbarb/til

## publishing to npm (your one command)

```bash
cd ~/Desktop/til && npm login && npm publish   # name til-lang is free (verified E404)
```
