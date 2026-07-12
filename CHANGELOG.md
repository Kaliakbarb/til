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
