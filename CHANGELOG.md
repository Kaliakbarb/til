# changelog

## 0.2.1 — 2026-07-12
- regex builtins: `rall` / `rmatch` / `rsub` (JS syntax, catchable `E_REGEX`; patterns idiomatically in raw `'…'` strings). Card grows to 1,777 o200k tokens — still within the ≤2k budget
- shebang scripts verified (`#!/usr/bin/env til`)
- LICENSE, CHANGELOG, CONTRIBUTING, CI (ubuntu/macos/windows), npm packaging

## 0.2.0 — 2026-07-12
- **benchmark headline corrected after independent adversarial audit**: Python/JS baselines re-optimized (14 of 20 fell); honest result is til ≈ Python on tokens (−2.3%) and −40.3% vs JS. Older −10.5% claims are obsolete
- host-extensible builtins: `createRuntime({builtins})` + `check({extraNames})`, errors wrapped as `E_HOST`
- `til repl` (persistent session, expression echo, multiline continuation, instant `eg` runs)
- Flappy Bird shipped: `games/flappy/` in til/pygame/canvas — til 645 vs 810 vs 777 o200k tokens, spec-locked and verified (til: deterministic 2,000-frame autopilot)
- `til grammar` (GBNF superset for constrained decoding); `--strict`, `--no-io`, `--no-eg` flags; error JSON gains `rule` card back-references
- `til run` now executes `eg` assertions by default (failures → stderr, exit 1)
- runtime hardening from adversarial review: cycle-safe display/equality/serialization, catchable `E_STACK` on every path (no raw host exceptions), `for` runaway guard, code-point string semantics, Python-style match binding, JSON on all CLI error paths

## 0.1.0 — 2026-07-12
- initial language: lexer/parser/checker/tree-walk interpreter in one dependency-free ESM file; ~70 builtins; contracts (`ensure`) + inline tests (`eg`); structured repair-oriented errors with did-you-mean; LLM.md prompt card; output-verified token benchmark; browser playground

## 0.3.0 — 2026-07-13
- `enum xs` builtin (dogfood-demanded); rounding semantics pinned with boundary tests; static contract discharge (`E_ENSURE_STATIC`) via constant folding
- **hard suite measured**: frontier 12/12 til = python; sonnet 9/12, haiku 10/12 pass@1 — and 12/12 pass@fix at every tier after one structured-error round (eval/hard/results.md)
- **repair experiment published**: 80 verified-failing mutants — til 40/40 = python 40/40 = minimal-feedback 40/40; honestly undecided at single-token fault depth
- map-vs-list confusion (found twice across models in the hard suite) → E_TYPE now hints `items`
- fuzzer: 440,000 programs, zero raw host errors; LSP server (diagnostics + quickfixes); VS Code live diagnostics; 25k-triple training corpus + QLoRA kit; constrained-decoding demo docs
