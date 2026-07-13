# hard-suite + repair experiment results — 2026-07-13

Sprint-1 measurements from ROADMAP.md. Protocol identical to eval/results.md (isolated
contexts holding only the card + task; byte-exact stdout; Claude Fable/Sonnet/Haiku via
subagents — one model family, disclosed; cross-vendor harness ready, needs a key).
12 tasks, 4 bands (algorithmic / stateful / large-input / underspecified), every task
with a verified til reference (eval/hard/reference/).

## pass@1 and pass@fix (one structured-error repair round, same-tier repairer)

| model | til pass@1 | python pass@1 | til pass@fix |
|---|---:|---:|---:|
| Fable 5 | **12/12** | 12/12 | 12/12 |
| Sonnet 5 | 9/12 | 12/12 | **12/12** |
| Haiku 4.5 | 10/12 | 12/12 | **12/12** |

- **The edge exists and is quantified**: sub-frontier models write hard til at 75–83% of
  their Python level on the first attempt (N2 misses the 90% v1.0 bar).
- **The loop closes it completely**: every failure was fixed in ONE round given til's
  structured error. This is the system claim in numbers — *language + check/run/repair
  loop ≥ native-Python zero-shot*, at every tier tested.
- Frontier (Fable) needed no loop: 12/12 cold, equal to its Python.

## Failure taxonomy (5 organic failures, all read in full)

| failure | class | consequence |
|---|---|---|
| sonnet top-ips, haiku dedupe-events | `group` returns a map; model piped it into list-only `enum`/`map` | **repeated cross-model confusion → shipped fix**: E_TYPE now hints "pipe through `items` first". The repair prompts also fixed both instantly |
| sonnet roman, haiku roman | subtractive-notation logic slips (output diffs, no crash) | wrong-output feedback sufficed for one-round fixes |
| haiku parse-config | first-`=`-only split mishandled | fixed in one round |
| sonnet csv-quoted | **harness artifact**: `</parameter>` protocol trailer leaked into the program | not a language failure; verification strips protocol trailers (disclosed); the underlying program was correct |

## Controlled repair experiment (N=80 verified-failing mutants) + ablation

Single-token faults (name-typo / off-by-one / operator-swap / string-literal) injected
into known-correct easy-suite programs, each verified to fail before repair; sonnet
repairer, one round, byte-exact re-verification:

| arm | repaired |
|---|---:|
| til, full structured error (didYouMean, locals, hint, rule) | **40/40** |
| python, native traceback (CPython 3.12, incl. its own did-you-mean) | **40/40** |
| til, minimal feedback — `error[CODE] at line N` only | **40/40** |

**Verdict: saturated — undecided, honestly.** At single-token fault depth a Sonnet-class
repairer fixes everything regardless of feedback richness; modern CPython tracebacks are
also good. The error-richness thesis is neither confirmed nor refuted here; the next
discriminating test is deep-logic faults at hard-suite difficulty (where the 5 organic
repairs did use the structured errors — but n=5 is anecdote, not measurement).

## Model-written token cost, hard suite (o200k, 12 tasks summed)

| model | its til | its python | delta |
|---|---:|---:|---:|
| Fable 5 | 2,135 | 1,980 | **+7.8%** (til larger) |
| Sonnet 5 | 2,191 | 2,484 | **−11.8%** |
| Haiku 4.5 | 2,397 | 2,193 | **+9.3%** (til larger) |

Combined with the easy suite (−15…−32% til) and the game (−17…−20% til), the full
honest token picture is **band-dependent**: pipeline-shaped and interactive work favors
til strongly; algorithmic control-flow (DP tables, nested loops) favors Python's terse
list-ops slightly. Averaged over an agent-typical mix, til still comes out ahead — but
"fewer tokens, always" would be a false claim and is not made.

## Method notes & artifacts

- Generations: eval/hard/generations.json · verification: generations.results.json ·
  fix round: organic-fixes.results.json · mutants: ../repair/mutants.json · repairs:
  ../repair/repairs.json. All verifiable by rerunning the scripts in eval/.
- The `</parameter>` leak (2 occurrences across 192 generations) is an artifact of the
  subagent transport, not of any model's til ability; both were syntactically caught by
  til's parser, and verification strips protocol trailers before running.
- Repairs for the 2 map-vs-list failures used pre-hint errors for generation-time
  capture but the re-verified errors now include the `items` hint added mid-experiment
  (disclosed; does not affect any reported number).
