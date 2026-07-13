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

- [ ] **Hard task suite (eval/hard/)**: 16 tasks in 4 bands — algorithmic (DP, graphs,
  parsing), stateful multi-step (simulations, interpreters-in-til), large-input
  (10k-line logs where windowing matters), and underspecified tasks where the model must
  write `ensure` contracts to pin its own assumptions. Each with byte-exact expected
  output and a verified til reference solution. *Accept: frontier model scores 50–85%
  pass@1 in til — hard enough to discriminate, not impossible.*
- [ ] **The repair experiment — the thesis test.** Inject N=200 controlled faults
  (name typos, arity slips, off-by-one, wrong-branch logic) into correct til and Python
  programs; measure one-round repair success given each language's native error output.
  This is the first direct test of "errors engineered as repair prompts," and fills a
  measured gap in the literature (no published data on did-you-mean/structured-error
  repair). *Accept: a number, whatever it is — published in eval/repair.md.*
- [ ] **Error-component ablation**: same experiment with error fields toggled
  (didYouMean off, locals off, rule-refs off, JSON→plain-text). Identifies which parts
  of the error design actually earn their bytes. *Accept: per-component delta table.*
- [ ] **Cross-vendor runs**: the HTTP harness exists; needs `EVAL_API_KEY`. GPT- and
  Gemini-family results for N1/N2. *Accept: results from ≥2 non-Anthropic vendors.*
- [ ] **Card dose-response**: pass@1 at 25/50/75/100% card size on the hard suite —
  the spec-size curve nobody has published. *Accept: 4-point curve in eval/results.md.*

## 2. Language v0.3 — only what evidence already demands

- [ ] `enum xs` → `[[0, x], …]` — the one builtin real dogfooding demanded
  (FRICTION.md #1). ~12 card tokens. *Accept: friction case rewrites cleanly; suite +4 egs.*
- [ ] **Rounding decision** (audit finding): `roundTo` is half-up, Python's `round` is
  banker's. Keep half-up (JS prior, matches the game/canvas world) but pin it in the
  card in five words and add boundary egs (`roundTo 2 0.125`). *Accept: documented,
  tested, bench fairness note updated.*
- [ ] **Static `ensure` discharge** (Vera's best idea, adapted): `til check` proves
  constant-foldable contracts at check time and reports them as `E_ENSURE_STATIC`
  before execution. Zero card cost — it's tooling, not syntax. *Accept: `ensure 1 == 2`
  caught by check; no false positives on the suite.*
- [ ] **Papercuts** from reviews: `1e21` display note or fix; syntax-error caret column
  on `1.`; `til fmt` (canonical formatter — now feasible since comments survive in
  token stream) — *stretch, only if fmt preserves comments perfectly.*
- [ ] **Frozen non-goals restated for v1.0**: imports, classes, async, a type system.
  The closed world IS the moat. Anything typed lives in `ensure` + egs.

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
- [ ] **LSP-lite**: `til check --json` already carries diagnostics; wrap it in a ~100-line
  language server so the VS Code extension gets live squiggles + did-you-mean quick-fixes.
  *Accept: typo → squiggle → one-click fix in VS Code.*
- [ ] **Constrained-decoding demo**: llama.cpp + `til grammar` + a small local model
  writing valid til — proves the co-design argument against the "just use tooling on
  Python" objection, on video.
- [ ] **til-native small model** (the MultiPL-T play): generate ~25k self-validated
  til programs (generate → check → run → keep passing ones), fine-tune a small open
  model. The literature says this lifts low-resource languages dramatically — it would
  make til *trained*, not just taught, while the card keeps covering frontier models.
  *Accept: fine-tuned model beats its own base on the hard suite in til.*
- [ ] **"Break til" page** on the site: the playground + a standing invitation that every
  uncatchable error or wrong-result is a bounty bug — adversarial review as a community
  process, since it was the single highest-value activity of the first cycle.

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
