# til — production readiness: research → plan → execution

Written 2026-07-12, before executing. Each item gets checked off as it lands, in this
document, honestly. "Production" for til means: a stranger (human or agent) can go from
zero to running til in under a minute, trust the semantics won't shift under them, and
get help when something breaks.

## 1. Research: how small languages actually ship

**Precedent 1 — the single-file interpreter ethos (Lua, QuickJS).** Lua's entire
credibility rests on being a small, dependency-free, embeddable C library with a frozen
spec and a conformance suite; QuickJS repeated the pattern for JS. til already has the
shape (one ~2.4k-line ESM file, zero deps, embeds in a browser tab); what Lua adds that
til lacks is *versioned releases with a compatibility promise*. → We ship semver tags and
declare `tests/lang.til` (226 assertions) the compatibility contract: nothing that breaks
it lands in a minor version.

**Precedent 2 — npm as the interpreter delivery channel (esbuild, prettier).** Tools
whose users already have Node ship as npm packages with a `bin` entry: `npm i -g` gives a
PATH command; `npx` gives zero-install execution. til's interpreter *is* Node-runnable
ESM with `bin/til` already wired — npm is the natural channel (no compilation, no
platform binaries needed). → `npm publish` readiness: `files` whitelist, `engines`,
LICENSE file (MIT is declared but the file must exist to be a real grant), README as the
package page.

**Precedent 3 — editor presence is table stakes for trust.** Humans review agent-written
code; a language whose files render as plain white text reads as a toy. The minimum
viable editor story is a TextMate grammar (VS Code, and via it Cursor/Windsurf — where
the agent-adjacent audience lives). LSP can wait; `til check --json` already contains
everything a future LSP needs. → Ship `tools/vscode-til/` (grammar + language config),
installable by copying to `~/.vscode/extensions`.

**Precedent 4 — CI as the public conformance statement.** For a language, green CI on
three OSes *is* the spec's warranty. Known risk found in this repo: `bench/run.mjs`
shells out to `python3`, which doesn't reliably exist on Windows runners; string/CRLF
handling is designed in but untested on Windows. → GitHub Actions matrix
(ubuntu/macos/windows) running the conformance suite everywhere; bench verification on
unix runners; platform-aware python resolution.

**Precedent 5 — the actual distribution surface for an *agent* language is agent
runtimes, not package managers.** til's own RESEARCH.md establishes the mechanism
(in-context teachability per MTOB/Aycock: the card, not training data). The delivery
unit for that is a **skill**: inject LLM.md into the session, expose `til check/run
--json` as the loop. A Claude Code skill is ~one markdown file and reaches every session
on this machine; an MCP server generalizes later. → Ship `~/.claude/skills/til/`.

**Capability gap analysis (from building flappy + 10 bench tasks + 8 eval tasks):** the
one recurring wall is **regex** — `clean`-style tasks survive on `split`/`replace`, but
log parsing, validation, and extraction don't. Python's `re` and JS's `RegExp` priors are
strong and nearly identical for the common subset. Cost check: 3 builtins ≈ 1 line of
card. Dates/formatting were needed 0 times across 21 programs — deferred, evidence-first.
→ Add `rall`, `rmatch`, `rsub` (JS regex syntax, catchable `E_REGEX`), re-measure the
card ≤2k, extend the conformance suite.

**What stays out, deliberately:** imports/packages (closed world is the load-bearing
design bet), a type system (contracts + egs + typed runtime errors carry it), async/net
(task language), performance work (tree-walker is fine at script scale; bytecode is a
someday-if-measured).

## 2. The plan (checked off as executed)

**Tier 1 — language completeness (before anything is published)**
- [x] regex builtins `rall re s` / `rmatch re s` / `rsub re new s` — JS syntax, `E_REGEX` catchable, `$1` group refs in rsub; patterns idiomatically in raw `'…'` strings (double-quoted `\d` would fight til escapes — discovered and pinned in tests)
- [x] conformance tests for all three + error path (suite: 226 → **234**)
- [x] shebang `#!/usr/bin/env til` verified end-to-end (executable .til file runs, regex inside interpolation and all)
- [x] LLM.md updated (+1 builtins line), re-measured: **1,777 o200k tokens** — within the 2k budget
- [x] SPEC.md non-goals updated (regex graduated, with the evidence note); version → 0.2.1

**Tier 2 — repository hygiene (the GitHub story)**
- [x] LICENSE file (MIT)
- [x] CHANGELOG.md (0.1.0 → 0.2.1, honest — includes the benchmark-headline correction)
- [x] CONTRIBUTING.md (how to run the suite, the compatibility contract, how bench fairness gates changes)
- [x] `.github/workflows/ci.yml` — conformance suite on ubuntu+macos+windows, bench verification on ubuntu+macos, node 18/22
- [x] bench runner: platform-aware python resolution (win: `python`, unix: `python3`)
- [x] README: install section (git clone / npm / npx), CI badge

**Tier 3 — publication**
- [x] `gh` repo created and pushed: **https://github.com/Kaliakbarb/til** (public, description, topics: programming-language · llm · ai-agents · interpreter · token-efficiency)
- [x] git tag `v0.2.1` pushed
- [x] npm package verified publishable: `npm pack --dry-run` clean — 14 whitelisted files, name `til-lang` free on the registry (E404). Actual `npm publish` needs the account owner's npm login; command: `npm publish` from repo root
- [x] playground + game redeployed with the 0.2.1 interpreter (regex builtins live in the browser too)
- [x] CI: first run failed on my own workflow bug (bash -e aborted the intentional-failure step; the language itself was green on all 3 OSes incl. Windows) — step rewritten as a proper assertion of the error-UX contract; green run required below

**Tier 4 — agent-runtime distribution**
- [x] Claude Code skill at `~/.claude/skills/til/` — registered live in the building session itself; injects the card via `til teach`, teaches the check→run→repair loop
- [x] VS Code extension `tools/vscode-til/` — grammar validated with the real TextMate engine (vscode-textmate + oniguruma tokenization of tricky cases: interpolation resume, raw strings, nested braces, multiline strings); installed at `~/.vscode/extensions/vscode-til-0.2.1/`

**Deferred, with reasons**
- [ ] `eval/` numbers — blocked on an API key by design (README says: run it before believing anyone)
- [ ] LSP — `check --json` already carries diagnostics; build when there are users
- [ ] Windows *bench* lane, dates/formatting builtins, bytecode VM — evidence-first: add when a real task hits the wall

## 3. Verification bar for this plan

Every checked box above corresponds to a commit in this repo; the suite, bench gate, and
game verifier must be green at HEAD; the GitHub repo must build green in Actions; the
live site must serve the new interpreter. Checked = done and verified, not done-ish.
