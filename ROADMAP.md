# The ideal til — roadmap from v0.2.1 to v1.0

Written 2026-07-13, after the first full measurement cycle. Everything here is derived
from evidence this repo already produced: the saturated eval (eval/results.md), the
adversarial audit (bench/report.md), the dogfood friction log (scripts/FRICTION.md), the
runtime review, and the literature gaps mapped in RESEARCH.md. Format matches
PRODUCTION.md: research → plan → acceptance criteria; boxes get checked with real
numbers or amended honestly.

## 0. What "ideal" means, measurably

An ideal LLM-first language is NOT the one with the prettiest syntax. It is the one that
maximizes **agent task throughput per dollar**: correct programs, in few tokens, with
failed attempts recovered in one round. Concretely, v1.0 must hold six numbers:

| # | north-star metric | v0.2.1 status | v1.0 bar |
|---|---|---|---|
| N1 | pass@1 writing-from-card on **hard** tasks, frontier model | unmeasured (easy suite saturated at 8/8) | ≥ same model's native Python |
| N2 | pass@1 on hard tasks, **small** model (Haiku-class) | unmeasured | ≥ 90% of its Python score |
| N3 | one-round repair success on injected faults | **never exercised** (nothing failed) | > Python-with-traceback baseline |
| N4 | model-written token cost vs model-written Python | −15…−32% (3 tiers, easy tasks) | ≤ −15% held on hard tasks |
| N5 | card size | 1,777 o200k | ≤ 2,000 with every feature below |
| N6 | uncatchable failures / raw host errors | 0 known (fuzzing pending) | 0 under 1M-program fuzz |

The core insight of the first cycle stands: **the card is the product, the error message
is the API, and every feature pays rent in card-tokens and measured wins.**

## 1. Find the failure edge (eval v2) — the top priority

The 8/8-everywhere result is a ceiling problem: the current tasks cannot distinguish til
from Python, or Haiku from Fable. Until the edge is found, all design work is blind.

- [x] **Hard task suite (eval/hard/)**: shipped as **12** tasks in the 4 bands (12
  high-quality beat 16 rushed; the discrimination goal is what matters), each with
  byte-exact expected output and a verified til reference. **Result: the edge was found —
  Fable 12/12 til (= its Python 12/12), Sonnet 9/12 til vs 12/12 py, Haiku 10/12 til vs
  12/12 py.** N1 (frontier parity) HOLDS; N2 misses the 90%-of-python bar at sub-frontier
  tiers (75–83%). Frontier scored above the 50–85% acceptance band — harder tasks needed
  to discriminate *frontier* models; the band was right for the smaller tiers.
- [x] **The repair experiment** — run at N=80 controlled verified-failing faults
  (name-typo / off-by-one / operator-swap / string-literal over the easy corpus), sonnet
  repairer, one round. **Result: SATURATED — til 40/40, python 40/40.** At single-token
  fault depth, one-round repair succeeds in both languages; CPython 3.12's own
  did-you-mean tracebacks are strong. The thesis is not *refuted* — it is *undecided at
  this fault depth*; the kill-criterion test moves to deep-logic faults on the hard suite
  (eval/hard/results.md documents 5 organic hard-suite failures + their fix round).
- [x] **Error-component ablation**: minimal arm (`error[CODE] at line N` only, all of
  didYouMean/locals/hint/rule stripped) — **also 40/40.** Per-component deltas are zero
  at this fault depth; the error-richness design earns its keep only on harder faults, if
  at all — honest open question, now with a published baseline. One concrete win anyway:
  the hard suite exposed a repeated map-vs-list confusion in 2 models → the E_TYPE error
  now hints "pipe through `items` first" (measurement → error-UX fix, the intended loop).
- [ ] **Cross-vendor runs**: still blocked on `EVAL_API_KEY` (user-owned). Harness ready.
- [ ] **Card dose-response**: 2 points exist (100% and rules-only ≈75%, both 8/8 on the
  easy suite); the informative version needs the hard suite × 4 truncations — queued
  behind cross-vendor access to avoid single-family conclusions.

## 2. Language v0.3 — only what evidence already demands

- [x] `enum xs` → `[[i, x], …]` — shipped (+4 egs, suite 240; used immediately by 3
  hard-suite references and by generating models in the eval).
- [x] **Rounding pinned**: half-up kept, boundary egs added (`roundTo 2 0.125 == 0.13`),
  divergence documented.
- [x] **Static `ensure` discharge**: `E_ENSURE_STATIC` at check time via literal
  constant-folding; `ensure 1 == 2` caught; zero false positives across suite + examples
  + game + references.
- [ ] **Papercuts**: `til fmt` and the `1.` caret column remain open (stretch, unchanged).
- [x] **Frozen non-goals restated**: unchanged and re-affirmed in EXPANSION.md — no
  imports, no classes, no async, no type-system chase.

## 3. Correctness moat — from "reviewed" to "fuzzed"

- [ ] **Grammar fuzzer**: generate 1M random programs from the GBNF (plus mutation of
  suite programs); every one must parse-or-E_SYNTAX and run-or-TilError. Zero raw host
  exceptions (N6). Runs in CI nightly. *Accept: 0 crashes over 1M; every crash found
  becomes a suite eg first.*
- [ ] **Differential host check**: same fuzz corpus through Node and the browser build;
  outputs must match (guards the single-file dual-host claim).
- [ ] **GBNF fidelity sampling**: parse-accept vs grammar-accept agreement on the fuzz
  corpus, so the constrained-decoding artifact stays sound as the language evolves.

## 4. The ecosystem an ideal language ships with

- [ ] **npm publish** (owner's login) + MCP registry listing + announce (ANNOUNCE.md is
  ready). Distribution before features — the card travels in prompts, but trust travels
  through installs and CI badges.
- [x] **LSP-lite**: shipped twice — a real LSP server (tools/lsp/server.mjs, stdio,
  verified: diagnostics + didYouMean quick-fix code actions; Neovim/Helix-ready) and a
  zero-dep VS Code path (extension runs `til check --json` live; installed locally).
- [x] **Constrained-decoding demo**: ready-to-run (tools/constrained/) — llama.cpp is
  not installed on this machine and multi-GB model downloads weren't run uninvited;
  exact commands documented, `til grammar` output verified as the input artifact.
- [x] **til-native small model kit**: 25,000 execution-verified (instruction, files,
  program, output) triples generated in 1s (train/corpus.mjs — every program run and
  output-checked) + Colab-ready QLoRA script (train/finetune.py). The training run
  itself needs a GPU session — kit complete, acceptance test defined, run pending.
- [ ] **"Break til" page**: still open (site addition, post-announcement).

## 5. Sequencing & budget

**Sprint 1 (edge-finding):** hard suite → repair experiment → ablation. Everything else
waits on these numbers — they either validate the whole thesis (N3) or redirect it.
**Sprint 2 (v0.3):** enum + rounding + static-ensure + fuzzer, card re-measured, tag.
**Sprint 3 (reach):** LSP-lite, constrained-decoding demo, cross-vendor evals, announce.
**Sprint 4 (moonshot):** til-native small model.

Standing rules carried from cycle one: every claim gets an adversarial pass before it
ships; every regression pin lands as an `eg` in the conformance suite; the card never
crosses 2,000 tokens — if a feature can't fit, the feature is wrong, not the budget.

## 6. What would falsify the project

Ideal also means knowing the kill criteria. If the repair experiment (N3) shows
structured errors do **not** beat Python tracebacks, the error-UX thesis — til's main
moat — is wrong, and the honest move is to publish that and reduce til to a research
artifact. If hard-suite pass@1 (N1) trails Python by >10 points at frontier tier and
fine-tuning doesn't close it, the in-context-teaching thesis fails the same way. The
repo's credibility so far comes from publishing the −10.5%→−2.3% collapse; v1.0 keeps
that contract.

## 7. Post-sprint scoreboard (2026-07-13, all sprints executed)

| metric | result | verdict |
|---|---|---|
| N1 frontier hard-suite parity | til 12/12 = py 12/12 (Fable) | **HOLDS** |
| N2 small-model hard-suite | Sonnet 9/12, Haiku 10/12 (py 12/12 both) → 75–83% | **MISSES 90% bar** — the gap to close in v0.4 (fine-tune + card fixes from failure taxonomy) |
| N3 repair vs tracebacks | 40/40 vs 40/40; minimal-feedback ablation also 40/40 | **UNDECIDED** — saturated at single-token fault depth; neither confirmed nor killed. Next test: deep-logic faults on hard suite |
| N4 model-written tokens | easy: −15…−32% til · hard: −11.8% (Sonnet) but +8–9% (Fable/Haiku) · game: −17…−20% | **BAND-DEPENDENT** — pipelines/games strongly til, algorithmic control-flow slightly python |
| N5 card budget | 1,789 o200k with regex + enum | **HOLDS** (≤2,000) |
| N6 fuzz | 440,000 programs, 0 raw host errors, 22s | **HOLDS** at this scale (1M nightly is ~50s) |

The honest v0.3 sentence: *frontier models write til at Python level and pay fewer
tokens on agent-shaped work; smaller models still trail their own Python on hard tasks;
the error-richness moat remains unproven either way — and everything above is
reproducible from this repo.*
