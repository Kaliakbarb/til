# repair experiment v2 — deep faults, three arms — 2026-07-14

The escalation of eval/hard/results.md's undecided N3 verdict. 16 hand-crafted deep
logic faults (silent wrong output or far-from-cause failures), each injected identically
into a verified til reference, a contract-annotated variant of it, and a verified python
mirror; 45 verified-failing jobs after pruning; **haiku** repairer (weakest tier, maximum
sensitivity), one round, byte-exact re-verification.

## Result: saturated a second time

| arm | repaired | avg feedback size |
|---|---:|---:|
| til + `ensure` contracts | 15/15 | 98 tokens |
| til bare | 15/15 | 58 tokens |
| python bare | 15/15 | 58 tokens |

Combined with v1 (single-token faults, sonnet, 120 jobs): **n = 185 repairs across two
fault depths, two repairer tiers, three feedback designs — zero differentiation.**

## The verdict, stated plainly

**The claim "til's structured errors repair better than python tracebacks" is NOT
SUPPORTED at ≤80-line program scale.** Given feedback that includes an output diff
against the expected result, even a Haiku-class model finds and fixes deep logic faults
in one round, in any language, with any feedback format. The contracts arm localized
faults beautifully (7 silent corruptions became precise `E_ENSURE` errors with locals) —
and it did not matter, because there was no headroom left to improve. Contracts even
*cost* more feedback tokens (98 vs 58 avg; shorter in only 1/15 paired faults, since
locals + hints outweigh a diff at this output size).

Per ROADMAP §6's kill-criteria contract, this is published as-is.

## What survives, precisely

1. **The oracle caveat — the real remaining hypothesis.** Every repair here received
   `expected: <exact output>` in its feedback, because the harness knows the answer.
   Real agent tasks usually have NO output oracle: a wrong-output fault is *silent*.
   In that regime contracts are not a better error message — they are the only error at
   all (7 of 15 faults here would have shipped unnoticed without them). Measuring that
   needs a detection-rate experiment, not a repair-rate one.
2. **The loop still carries the system claim**: pass@fix 12/12 at every tier on the hard
   suite (eval/hard/results.md) is untouched by this result — repair works; it just
   works equally well from python's feedback too.
3. **What actually differentiated til in all measurements so far**: static name-checking
   before execution (hallucinations never reach runtime), the in-context teachability
   (8/8→12/12 from a 1.8k card), token economy on pipeline/interactive work, and total
   sandboxability. The moat is those — not error prose.

## Design consequences adopted

- README/ROADMAP no longer claim repair superiority; the error design is justified by
  the oracle caveat (detection, not repair) and by developer experience, honestly.
- The next N3-family experiment, if any, is **detection-rate**: seed faults, give agents
  the task WITHOUT expected outputs, measure how many corruptions each design catches
  before "shipping". Contracts should win that by construction — measure it anyway.

## Method notes

- Contracts were authored as generic per-task invariants before fault verification, but
  by the same author as the faults (solo protocol — a blind-authored replication would
  strengthen this; disclosed).
- 3 of 48 candidate jobs were pruned because the fault produced identical output
  (balanced-max/measure-from-bottom on this input).
- Artifacts: build.mjs (full substrate, reproducible), jobs.json, repairs.results.json.
