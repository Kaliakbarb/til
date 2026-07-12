# contributing to til

**The compatibility contract is `tests/lang.til`.** Every semantic rule of the language is
pinned there as an executable `eg` assertion (234 at v0.2.1). A change that breaks a passing
assertion is a breaking change and needs a major-version argument; a change that adds
behavior must add assertions that pin it.

Run everything:

```bash
npm test                       # conformance suite + example programs
npm run bench                  # 10-task benchmark: byte-identical outputs gate the token table
node games/flappy/verify.mjs   # deterministic 2,000-frame game verification
```

Ground rules learned the hard way (see RESEARCH.md and bench/report.md):
- **Benchmark honesty**: if you improve a til solution in `bench/tasks/`, you must attempt
  the equivalent idiomatic improvement to the Python and JS baselines. Byte-identical stdout
  is the gate; the runner refuses to write a report otherwise.
- **The card is the budget**: LLM.md must stay under ~2,000 o200k tokens *including* every
  builtin. New builtins pay rent: they need a recurring agent task they unlock, not a
  benchmark they win. Measure with `node bin/til tokens LLM.md`.
- **No imports, no coercion, no significant whitespace** are identity decisions backed by
  the evidence in RESEARCH.md §1 — arguments to revisit them need new evidence, not taste.
- **Errors are the product**: any new failure mode needs a stable `E_*` code, a location, a
  hint, and a `--json` path. No raw host exceptions may escape (`tests/lang.til` pins this).
