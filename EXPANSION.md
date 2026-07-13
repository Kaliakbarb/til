# Displacing Python/JS — the layer-by-layer expansion plan

Honest framing first: no language replaces Python/JS head-on — the ecosystem moat is
decades deep. The winnable formulation: **replace them wherever code is written by
agents, not humans**, and expand the boundary of "wherever" one layer at a time. This is
how every successful language landed (TS via typed-JS niche, Rust via systems niche).
Displacement is an economic event: til wins a layer when
`cost(task) = tokens × retry-rate × latency` is lower than Python's for that layer —
which is exactly what ROADMAP.md's north-star metrics measure.

## Layer 0 — one-shot agent scripts ✅ (today)
Glue, data munging, text/JSON/CSV. Measured: pass@1 parity with Python down to Haiku,
15–32% fewer model-written tokens. This layer is won pending cross-vendor replication.

## Layer 1 — standing automation (scripts that live for weeks)
Cron jobs, report generators, file watchers driven by agent platforms.
Needs from ROADMAP: `enum`, date/time verbs (evidence-gated), 1M-program fuzz (N6),
LSP-lite so humans can *review* what agents wrote. Exit criterion: a til script running
unattended in real automation for 30 days without an uncatchable failure.

## Layer 2 — integrations: the reason everyone reaches for Python
HTTP, databases, queues. NOT via libraries (that would re-open the hallucination hole) —
via **standardized host capability profiles**:
- `til-web` host: `fetch`, `serve` builtins; `til-data` host: `sql`.
- A script declares what it needs (`# needs: fetch`), the HOST grants or denies —
  capability-based security by construction, no ambient authority ever.
- Each profile is a documented ~10-builtin card appendix; the core card stays ≤2k.
This turns til's biggest weakness (no ecosystem) into the pitch to agent platforms:
*the language where you choose exactly what generated code can touch.*
Exit criterion: a real agent task hitting a real API end-to-end in sandboxed til.

## Layer 3 — performance: compile away the gap
The tree-walker loses hot loops. The cheap win is a **til→JS transpiler** (semantics are
deliberately JS-adjacent: float64, UTF strings, maps) — near-V8 speed, deployable
anywhere JS runs, ~2k lines. Bytecode VM only if transpile proves insufficient.
Exit criterion: within 3× of CPython on the hard-suite algorithmic band.

## Layer 4 — humans follow the agents
Nobody *chose* YAML; the ecosystem dragged them in. When agent-written til is everywhere
in a team's automation, humans need: formatter (`til fmt`), debugger (`--trace` with the
same structured-event shape as errors), real LSP, docs site. Build these when layer 1-2
adoption exists, not before.

## Layer 5 — get into the models themselves
The card covers frontier models; training coverage removes the card tax for small ones:
- MultiPL-T-style corpus: generate → check → run → keep 25k+ self-validated til
  programs; publish as an open dataset; fine-tune small open models (ROADMAP moonshot).
- Publish the corpus + spec so til enters future pretraining crawls organically.
- Platform placement: the skill/MCP server (shipped) into agent-framework registries —
  the system prompt is til's package manager.
Exit criterion: a small open model writes til at its Python level *without* the card.

## The leverage point: platforms, not programmers
Individual developers won't switch — they don't have to. Agent platforms (Claude Code,
Cursor, OpenAI agents, internal fleets) pick the language their agents emit for small
tasks. The sales pitch to a platform is three numbers: fewer tokens per task (measured),
higher one-round repair rate (ROADMAP N3 — the experiment that decides everything), and
a sandbox story no general-purpose language can match. If N3 fails, this whole document
reduces to "til stays a niche task language" — and we'll say so.

## What we will never do (the moat is the discipline)
No package manager. No user imports. No classes/async/type-system chasing Python
feature-parity. Every one of those would trade til's measured moats for a fight it
cannot win against 30 years of ecosystem.
