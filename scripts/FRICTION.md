# dogfood friction log

Real utilities written in til (`scripts/`), run against real data, with every point of
friction recorded. This file decides what earns card-space in v0.3 — usage evidence, not
taste (see CONTRIBUTING.md).

## scripts written 2026-07-12

- `loc.til` — repo lines-of-code by extension (`git ls-files | til scripts/loc.til`). Worked
  first run on this repo.
- `todo.til` — TODO/FIXME/HACK scanner with line numbers over argv files. Worked.
- `benchsum.til` — recomputes the benchmark table from `bench/results.json`; matches
  `report.md` exactly (543/556/909).

## friction found (v0.3 candidates, in observed-pain order)

1. **No enumerate.** Line numbers require `zip (range 1 (len xs + 1)) xs` — 10 tokens for
   what should be ~3. Seen once, will recur in any grep-like task. Candidate: `enum xs`
   → `[[0, x], …]` (~12 card tokens). Strongest case so far.
2. **No directory listing / glob — by design, but felt.** `loc.til` needed
   `git ls-files |` and `todo.til` needed explicit file args. The sandbox story (`--no-io`,
   virtual-fs MCP host) depends on the fs surface staying read/write-by-path only, so the
   answer is probably a documented shell idiom, not a builtin. Keeping as-designed.
3. **Tab in interpolation** works (`"{a}\t{b}"`) — no friction, just confirming it's exercised.

## what worked better than expected

- Per-element failure absorption: `map {f -> {…: read f | …} catch null} | keep {it}` —
  unreadable-file entries collapse to null and drop out. This composed on the first try.
- `t, p, j = tot "til", tot "py", tot "js"` — multi-assign from three calls reads exactly
  like the thought.
- Dynamic map indexing `r.langs[lang]` inside a lambda — no special case needed.
