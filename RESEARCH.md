# til — research base

What the published evidence says about designing a programming language that LLMs write
best, how til's design maps onto it, and where til's claims are still unproven.
Compiled 2026-07-12. Sections: 1. evidence → design audit · 2. prior art & positioning ·
3. open questions this repo ships harnesses for.

## 1. Evidence → design audit

Each row: a finding from the literature, its strength, and what til does about it.

### 1.1 What actually goes wrong in LLM code

| finding | strength | til's response |
|---|---|---|
| Frontier models have "adequately learned syntax"; failures are dominated by semantic/logic errors, and most bad code compiles ([2406.08731](https://arxiv.org/abs/2406.08731)) | strong | Don't sell "simpler syntax" as correctness. til's correctness levers are the semantic ones: contracts (`ensure`), inline tests (`eg`), no coercion, fail-fast typed errors |
| Undefined names are the #1 static error class in 1M sampled completions ([ACL industry '23](https://aclanthology.org/2023.acl-industry.34/)) | strong | `til check` name-resolves every identifier before execution, with Damerau-Levenshtein did-you-mean |
| 19.7% of package recommendations are hallucinated (576k samples, 16 models); slopsquatting is a live attack ([2406.10279](https://arxiv.org/abs/2406.10279), [aikido.dev](https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks)) | strong | **No import mechanism exists.** ~70 builtins, closed world. The failure class and its supply-chain attack surface are deleted, not mitigated |
| API-knowledge conflicts (wrong attribute, hallucinated object) form a stable cross-model taxonomy ([2404.00971](https://arxiv.org/abs/2404.00971), [2403.08937](https://arxiv.org/abs/2403.08937)) | moderate | One flat stdlib small enough to include *in full* in the prompt card — the model never recalls an API from weights |

### 1.2 Teaching a never-seen language in context

| finding | strength | til's response |
|---|---|---|
| A grammar book in context yields useful translation of a truly unseen language (MTOB/Kalamang, [2309.16575](https://arxiv.org/abs/2309.16575)) | strong | The premise of LLM.md: the whole language rides along in ~1.7k tokens |
| Nearly all of that gain comes from the *examples*, not the grammar prose ([2409.19151](https://arxiv.org/abs/2409.19151)) | strong | LLM.md is being rebalanced example-dominant (idioms section ≥ ⅓ of the card); rules stay only where an example can't carry the constraint |
| Compact grammars in-context help DSL generation, more with constrained decoding ([2305.19234](https://arxiv.org/abs/2305.19234)) | moderate | til's grammar fits in SPEC.md §3 (~40 lines EBNF) — usable directly for grammar-constrained decoding |
| No dose-response curve exists for spec-size vs proficiency in programming languages | gap | `eval/` exists to measure exactly this (see §3) |

### 1.3 Tokenizer economics

| finding | strength | til's response |
|---|---|---|
| Identical tasks differ ~2× in tokens across real languages; terse-but-alien J "wins" tokens while losing accuracy ([rankings](https://ubos.tech/news/token%E2%80%91efficient-programming-languages-rankings-and-insights/)) | weak-moderate | til targets the sweet spot: token parity with Python (−2.3%) and −40% vs JS against adversarially-optimized baselines (bench/, output-verified) using only ASCII words and `|` — no APL route |
| BPE–grammar misalignment destabilizes generation; rare sigils fragment ([TokDrift 2510.14972](https://arxiv.org/abs/2510.14972)) | moderate-strong | Keywords are common English words (single tokens in o200k/cl100k); the only operator beyond C-family is `|`, a single token everywhere |
| Modern tokenizers made indentation cheap; you can't retrain the tokenizer, so optimize for existing ones ([2107.03374](https://arxiv.org/abs/2107.03374), [2402.01035](https://arxiv.org/abs/2402.01035)) | strong | til's token claims are measured against o200k + cl100k as shipped, not a bespoke tokenizer |

### 1.4 Self-repair loops

| finding | strength | til's response |
|---|---|---|
| Self-repair is bottlenecked by feedback quality; better feedback → substantially better repair ([2306.09896](https://arxiv.org/abs/2306.09896)) | strong | Error messages are the most-engineered surface of the language: code, source line, caret, locals snapshot, hint, did-you-mean — emitted as JSON with `--json` |
| Repair success ranks: rich mixed feedback 63.6% > test 57.9% > minimal 53.1% > raw compiler 49.2% ([FeedbackEval 2504.06939](https://arxiv.org/abs/2504.06939)) | moderate | til errors combine the top categories: located snippet + expected-vs-actual (eg failures show both sides) + hint |
| rustc-style structured errors enable ~74% automated fixes ([RustAssistant 2308.05177](https://arxiv.org/abs/2308.05177)) | moderate-strong | Same shape: stable error codes (E_NAME, E_TYPE, …), localization, machine-readable |
| Gains flatten after ~2 repair rounds ([2604.10508](https://arxiv.org/html/2604.10508)) | moderate | eval/ harness budgets exactly one repair round — the regime where feedback quality matters most |
| Did-you-mean suggestions for LLM repair: zero published measurements | gap | til ships them anyway (cheap); eval/ can ablate them |

### 1.5 Familiarity transfer

| finding | strength | til's response |
|---|---|---|
| Models collapse to near-chance on counterfactual semantics (1-based-indexing Python: ~54%) ([2307.02477](https://arxiv.org/abs/2307.02477)) | strong | til deviates from entrenched semantics **nowhere**: 0-indexed, `=`/`==`, Python truthiness, Python floored `%`, C operators. Novelty is confined to surface (pipes, juxtaposition — both with strong priors: shell, Haskell/Ruby) and to *added* checkable structure |
| Syntax-level perturbations hurt code models most ([ReCode](https://aclanthology.org/2023.acl-long.773/)) | strong | One canonical style; whitespace never significant; `f(a, b)` tolerated alongside `f a b` so prior-driven slips still parse |
| Low-resource failure is mostly data scarcity and is fixable with ~25k fine-tuning items ([MultiPL-E 2208.08227](https://arxiv.org/abs/2208.08227), [2308.09895](https://arxiv.org/abs/2308.09895)) | strong | Honest concession: til in-context will trail Python zero-shot on hard logic. The wager is the *system* (card + checker + repair loop) closes the gap on agent-sized tasks — eval/ measures precisely this. If it doesn't, this repo documents a negative result |
| Naive translation from a familiar language shows negative transfer on unseen languages ([CangjieBench 2603.14501](https://arxiv.org/pdf/2603.14501)) | moderate | LLM.md teaches til directly with til examples; it never says "like Python but…" |

### 1.6 Inline contracts and tests

| finding | strength | til's response |
|---|---|---|
| Model-emitted tests + execution agreement: +18.8 pass@1 ([CodeT 2207.10397](https://arxiv.org/abs/2207.10397)) | strong | `eg` is first-class syntax, one token, zero ceremony — the card instructs models to emit egs with every fn |
| Test-approval loops: +46 pass@1, higher human trust ([TiCoder 2404.10100](https://arxiv.org/abs/2404.10100)) | strong | egs are human-readable one-liners — built to be the approval surface |
| LLM-written postconditions catch real bugs ([nl2postcond 2310.01831](https://arxiv.org/abs/2310.01831)) | moderate | `ensure` contracts execute on every run, not only under test, and failures carry a locals snapshot |

## 2. Prior art & positioning

The "language for LLMs" space, as of 2026-07 (all claims sourced; GitHub stats verified live):

| project | year | core bet | evidence offered | status |
|---|---|---|---|---|
| [MoonBit](https://www.moonbitlang.com/blog/moonbit-ai) | 2023– | full industrial language; "AI-native" = flat toplevel + mandatory sigs (KV-cache-friendly), constrained sampler in toolchain | "significant" compile-rate gain, no published numbers | beta, funded, [1.0 planned H1 2026](https://www.moonbitlang.com/blog/roadmap) |
| [Vera](https://github.com/aallan/vera) | 2026 | post-cutoff language taught in-context; De Bruijn refs (no variable names); `requires/ensures/effects` + Z3; stable error codes E001–E702 with JSON export & fix suggestions | self-published [VeraBench](https://github.com/aallan/vera): 50 problems, 6 models, claims ≥ parity with Python | active daily, 387★ |
| [Nanolang](https://github.com/jordanhubbard/nanolang) | 2026 | spec fits in context; prefix notation; **compiler refuses functions without tests** | anecdotal ([HN](https://news.ycombinator.com/item?id=46684958)) | active, 612★ |
| [Marsha](https://github.com/alantech/marsha) | 2023 | English+examples → LLM-compiled tested Python | "aim for 80%+" | dead (last push 2023-11) |
| [B-IR essay](https://github.com/ImJasonH/ImJasonH/blob/main/articles/llm-programming-language.md) | 2026 | LLM-designed language sketch: inline tests, explicit delimiters, no significant whitespace | informal | essay |
| [Bosque/BosqueIR](https://arxiv.org/abs/2407.06356) | 2024 | "regularized programming": contracts + examples as the LLM interface | position paper | research |
| [Token Sugar](https://arxiv.org/abs/2512.08266) | 2025 | reversible shorthand at *pretraining* level | −11–15% tokens, Pass@1 preserved | academic |
| [SudoLang](https://medium.com/javascript-scene/sudolang-a-powerful-pseudocode-programming-language-for-llms-d64d42aa719b) / [LMQL](https://lmql.ai/) / [DSPy](https://github.com/stanfordnlp/dspy) | 2023– | different category: pseudocode run *by* the LLM / DSLs for orchestrating LLM calls | — | active |

**The three strongest published counter-arguments, faced:**

1. *Training-data dominance* — pass@1 tracks training-set representation; "off-distribution
   performance drops off a cliff" ([kirancodes](https://kirancodes.me/posts/log-lang-design-llms.html),
   [MultiPL-E](https://arxiv.org/abs/2208.08227)). **Response:** MTOB ([2309.16575](https://arxiv.org/abs/2309.16575))
   and practitioner replications on Roc/Unison/week-old languages ([Prescod](https://medium.com/@prescod/llms-and-new-programming-languages-complementary-or-conflicting-0a2486275a66),
   [Willison](https://simonwillison.net/2025/Nov/7/llms-for-new-programming-languages/)) show frontier models
   learn small languages in-context. Concession: true for frontier models only; til's eval/ exists
   because this must be measured, not asserted.
2. *Token efficiency is the wrong metric* — regeneration erases savings; format restriction can
   degrade reasoning ([2408.02442](https://arxiv.org/abs/2408.02442)). **Response:** agreed on
   ordering — til's README already ranks round-trips-killed above the token delta
   (≈parity with Python post-audit); and Token Sugar
   shows economy and quality aren't opposed ([2512.08266](https://arxiv.org/abs/2512.08266)).
3. *Tooling on Python/TS fixes everything cheaper* — constrained decoding guarantees any grammar
   ([2405.21047](https://arxiv.org/abs/2405.21047)). **Response:** constrainers distort output
   quality when misaligned (up to −97% functional correctness, [2606.21619](https://arxiv.org/abs/2606.21619));
   a small regular grammar is precisely what makes constrained decoding sound — co-design, not either/or.

**Positioning verdict** (from the adversarial landscape sweep): no project ships til's triple —
**(1) the entire spec is the prompt (1,728 tokens), (2) an output-verified token benchmark as a
headline artifact, (3) errors engineered as repair prompts.** Vera is the closest thesis-mate and
holds one real edge (machine-verified contracts); its VeraBench parity-with-Python result is also
the best external datapoint *for* this whole category. Ideas adopted from neighbors at zero spec
cost: grammar export for constrained decoding (`til grammar`, after MoonBit/CangjieBench) and
spec-back-references in error JSON (after Vera).

## 3. What this repo ships to close its own evidence gaps

The literature has three holes exactly where til lives; each has a harness here:

1. **Spec-size dose-response for code** (no published curve): `eval/run.mjs` prompts a model
   with only LLM.md + task, byte-verifies output. Ablate by truncating the card.
2. **Borrowed vs alien surface at fixed semantics**: the interpreter is one file; a
   surface-syntax fork is a lexer swap. Not yet run.
3. **Error-format ablation for repair** (structured vs free-text vs did-you-mean):
   `eval/` implements the one-repair-round loop; formats are a flag away.

Until eval numbers exist, til's honest status is: **measured token parity with Python,
−40% vs JS, output-verified against adversarially-optimized baselines** (bench/),
**failure-mode surface argued from strong external evidence** (§1), **end-to-end
superiority unproven** (eval/ pending an API key).
