# eval results — write-from-card, 2026-07-12

**Question:** can a model that has never seen til write correct programs from the
1,777-token card alone — and how does that compare to the same model writing native Python?

## Method (read this before the numbers)

- 8 tasks (`tasks.json`), each with exact expected stdout; **byte-identical output = pass**.
- Each generation ran in an isolated fresh context containing ONLY the language card
  (til) or a bare "write Python 3, stdlib only" instruction (Python control) + the task
  spec + first 200 chars of each input file. No examples of solving these tasks, no
  tool use, no retries at generation time.
- **Models: Claude Fable 5, Claude Sonnet 5, Claude Haiku 4.5** — run as isolated
  subagents on the developer's machine rather than through the HTTP harness
  (`run.mjs`), because no API key was available. Same protocol, honestly disclosed
  limitation: **one model family**. Cross-vendor replication needs `EVAL_API_KEY`
  (the harness is ready; results welcome).
- til was invented ~12 hours before this eval ran. No model has it in training data.
- Ablation: Fable also ran with the card **truncated to rules-only** (idioms/examples
  section removed — 4,195 of 5,546 chars kept).
- Verification: `verify-batch.mjs` — til through `check` then `run` (egs included),
  Python through `python3`, sandboxed per-task directories.

## pass@1 (first attempt, byte-exact)

| model | til from card | native Python |
|---|---:|---:|
| Fable 5 | **8/8** | 8/8 |
| Sonnet 5 | **8/8** | 8/8 |
| Haiku 4.5 | **8/8** | 8/8 |
| Fable 5, rules-only half card | **8/8** | — |

**The benchmark saturated.** No repair round was needed — pass@fix ≡ pass@1. Three
honest readings, in decreasing strength:

1. **The core bet holds at this difficulty**: writing til from an in-context card was
   *as reliable as writing native Python*, down to Haiku-class models — exactly the
   regime where the literature (MultiPL-E lineage) predicts unseen languages collapse.
2. **The tasks have a ceiling.** Agent-typical file/data tasks of this size can't
   discriminate between the languages or the models. Finding til's failure edge needs
   harder tasks (multi-step state, algorithmic depth, larger files) — v0.3 work.
3. **The half-card result complicates the "examples carry everything" ICL finding**
   ([2409.19151](https://arxiv.org/abs/2409.19151)): at this difficulty, rules-only
   sufficed. Example-weight in the card may matter only at higher task difficulty.

## Token economics of *model-written* programs (o200k, 8 tasks summed)

| model | its til | its Python | til saving |
|---|---:|---:|---:|
| Fable 5 | 397 | 468 | **−15.2%** |
| Sonnet 5 | 379 | 561 | **−32.4%** |
| Haiku 4.5 | 412 | 537 | **−23.3%** |

This is the missing third layer of the token story. The adversarially-optimized
benchmark (bench/) showed *hand-tuned ceilings* at parity (til −2.3% vs Python). But
models don't emit hand-tuned Python — they emit defensive Python (`if __name__`,
strip-guards, intermediate variables). Left to write naturally in both languages,
**every tier emitted 15–32% fewer tokens in til**, without being asked to be brief.

## Qualitative notes (from reading all 56 programs)

- Fable's log-grep solution used `rmatch 'ERROR' it` — a builtin added to the card
  ~2 hours before the eval, used correctly with the raw-string pattern idiom. In-context
  learning of a brand-new stdlib surface works.
- One Sonnet solution assigned `counts = {}`, shadowing the builtin — the checker's
  `W_SHADOW` warning fired exactly as designed; the program still passed.
- Different tiers found different idioms for csv-top (Fable: `group|items|map|sortBy|last`;
  Sonnet: `top 1`; Haiku: explicit fold loop) — all correct. The language admits
  multiple registers, and small models pick the imperative one.

## What this does and doesn't prove

Proves: prompt-sized in-context teaching of a never-seen language is *practical* at
agent-task difficulty across model tiers of one family, and its practiced token economy
beats its hand-optimized economy. Doesn't prove: cross-vendor generality (needs API
harness run), behavior at higher difficulty (needs harder tasks), or superiority on
repair (the error-UX design was never exercised — nothing failed).
