# capability host profiles

til's core has no network, no databases, no ambient authority — and that is the
product, not a gap. Integrations arrive as **capability profiles**: a script declares
what it needs, the invoker explicitly grants it, and nothing else exists.

```til
# needs: fetch
stars = json (fetch "https://api.github.com/repos/Kaliakbarb/til" catch '{}')
print "stars: {stars.stargazers_count}"
```

```bash
til run stars.til                 # → refused: script declares `# needs: fetch`
til run stars.til --allow fetch   # → runs, with exactly this one capability
```

Rules:
- The `# needs: a, b` line must appear in the first 8 lines. Undeclared capability
  names simply don't exist (`E_NAME` at check time, like any hallucinated identifier).
- Declared-but-ungranted → the program **refuses to start** (exit 2, `E_CAPABILITY`
  as JSON with `--json`). `--allow all` grants everything declared.
- `til check` never needs grants — static analysis is always permitted.
- These builtins are NOT in the core language card (LLM.md stays ≤2k tokens). An agent
  host that grants a capability should append the relevant profile line below to its
  system prompt.

## profiles (v0.4)

| capability | builtins | card line for agent hosts |
|---|---|---|
| `fetch` | `fetch url` → response body as str (GET, 20s timeout, http/https only; errors are catchable) | `fetch url — GET, returns body str; catchable; write urls plainly` |
| `sql` | `sql db query` → list of row-maps (SQLite, via node:sqlite) | `sql "file.db" "select …" — returns [{col: val, …}]; catchable` |

Security notes: `fetch` shells out to curl with `-fsSL --max-time 20` and no redirect
of credentials; `sql` opens local files only. The MCP server (mcp/server.mjs) grants
NEITHER — its sandbox remains virtual-fs-only by design. Browser hosts define their own
profiles the same way (the game host's 7 drawing builtins are exactly this mechanism —
`createRuntime({builtins})` + `check({extraNames})`).

## adding a profile

A profile is (1) a name, (2) builtins passed to `capabilityBuiltins()` in src/til.mjs,
(3) one documented card line. Keep each profile under ~10 builtins — the closed-world
guarantee is only as strong as the smallest surface that does the job.
