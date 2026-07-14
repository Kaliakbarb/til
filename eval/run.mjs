// til model eval: can a model that has NEVER seen til write correct programs
// from the 1,550-token language card alone — and how does that compare to the
// same model writing Python (its native language)?
//
// Measures, per model × language:
//   pass@1      — first program produces byte-exact expected stdout
//   pass@fix    — after ONE round of feeding the error back (til: structured
//                 check/run error; python: stderr). This measures the
//                 self-repair-loop design directly.
//   tokens      — o200k tokens of the generated program
//
// Usage:
//   EVAL_API_KEY=sk-…  [EVAL_BASE_URL=https://openrouter.ai/api/v1]
//   [EVAL_MODELS=anthropic/claude-sonnet-5,openai/gpt-5-mini]
//   node eval/run.mjs
//
// Works with any OpenAI-compatible /chat/completions endpoint.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { encode as o200k } from 'gpt-tokenizer/encoding/o200k_base'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const TIL = path.join(root, 'bin', 'til')
const CARD = fs.readFileSync(path.join(root, 'LLM.md'), 'utf8')
const tasks = JSON.parse(fs.readFileSync(process.env.EVAL_TASKS || path.join(here, 'tasks.json'), 'utf8'))

const BASE = process.env.EVAL_BASE_URL || 'https://openrouter.ai/api/v1'
const KEY = process.env.EVAL_API_KEY
const MODELS = (process.env.EVAL_MODELS || 'anthropic/claude-sonnet-5').split(',').map(s => s.trim()).filter(Boolean)
const REPAIR_ROUNDS = 1

if (!KEY) {
  console.log(`eval/run.mjs — no EVAL_API_KEY set, nothing executed.

This harness answers the load-bearing question for til: does a model that has
never seen the language write it correctly from LLM.md alone, and does the
structured-error loop actually repair failures?

Run it:
  EVAL_API_KEY=<key> [EVAL_BASE_URL=…] [EVAL_MODELS=m1,m2] node eval/run.mjs

It prompts each model with ONLY the language card + a task spec (temperature 0),
runs the produced program in a sandbox dir, byte-compares stdout, gives failed
attempts ONE repair round with the error fed back, and writes eval/results.md.
${tasks.length} tasks, til vs python, same specs, same verifier.`)
  process.exit(0)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function chat(model, messages) {
  let lastErr
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await sleep(Math.min(60000, 4000 * 2 ** attempt))
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 1200 }),
    }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }))
    const body = await res.text()
    if (res.ok) {
      try {
        const j = JSON.parse(body)
        const content = j.choices?.[0]?.message?.content
        if (content) return content
        lastErr = `empty completion: ${body.slice(0, 150)}`
      } catch (e) { lastErr = `bad json: ${body.slice(0, 150)}` }
    } else {
      lastErr = `HTTP ${res.status} ${body.slice(0, 150)}`
      if (![429, 408, 500, 502, 503, 0].includes(res.status) && !/rate-limited|429/.test(body)) break
    }
  }
  throw new Error(`${model}: ${lastErr}`)
}

function extract(text, lang) {
  const fence = new RegExp('```(?:' + lang + '|)\\s*\\n([\\s\\S]*?)```')
  const m = text.match(fence)
  return (m ? m[1] : text).trim() + '\n'
}

function sandbox(task) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'til-eval-'))
  for (const [name, content] of Object.entries(task.files || {})) fs.writeFileSync(path.join(dir, name), content)
  return dir
}

// returns {pass, out, err} — err is what we feed back for repair
function runTil(code, task) {
  const dir = sandbox(task)
  const f = path.join(dir, 'prog.til')
  fs.writeFileSync(f, code)
  try {
    const chk = execFileSync('node', [TIL, 'check', f, '--json'], { encoding: 'utf8', cwd: dir })
    const cj = JSON.parse(chk.trim().split('\n').pop())
    if (cj.ok === false) return { pass: false, err: JSON.stringify(cj.errors?.[0] ?? cj) }
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '')
    return { pass: false, err: out.slice(0, 800) || String(e) }
  }
  try {
    const out = execFileSync('node', [TIL, 'run', f], { encoding: 'utf8', cwd: dir, timeout: 10000 })
    return { pass: out === task.expected, out, err: out === task.expected ? null : `program ran but stdout was:\n${out}\nexpected:\n${task.expected}` }
  } catch (e) {
    return { pass: false, err: ((e.stdout || '') + (e.stderr || '')).slice(0, 800) || String(e) }
  }
}

function runPy(code, task) {
  const dir = sandbox(task)
  const f = path.join(dir, 'prog.py')
  fs.writeFileSync(f, code)
  try {
    const out = execFileSync('python3', [f], { encoding: 'utf8', cwd: dir, timeout: 10000 })
    return { pass: out === task.expected, out, err: out === task.expected ? null : `program ran but stdout was:\n${out}\nexpected:\n${task.expected}` }
  } catch (e) {
    return { pass: false, err: ((e.stdout || '') + (e.stderr || '')).slice(0, 800) || String(e) }
  }
}

const SYS = {
  til: `You write programs in til, a small scripting language. Its COMPLETE specification:\n\n${CARD}\n\nRules: output ONLY one til program in a \`\`\`til fence. Read input files by name from the current directory. Print exactly what the task asks — nothing extra.`,
  py: `You write Python 3 scripts. Rules: output ONLY one Python program in a \`\`\`python fence, stdlib only. Read input files by name from the current directory. Print exactly what the task asks — nothing extra.`,
}

function taskPrompt(task) {
  const files = Object.entries(task.files || {}).map(([n, c]) => `\n${n} (first 200 chars):\n${String(c).slice(0, 200)}`).join('')
  return `Task: ${task.spec}${files ? '\n\nInput files present in the working directory:' + files : '\n\n(no input files)'}`
}

const rows = []
for (const model of MODELS) {
  modelLoop:
  for (const lang of ['til', 'py']) {
    let p1 = 0, pFix = 0, toks = 0
    const fails = []
    for (const task of tasks) {
      const messages = [{ role: 'system', content: SYS[lang] }, { role: 'user', content: taskPrompt(task) }]
      let raw
      try { raw = await chat(model, messages) }
      catch (e) { console.error(`! ${model} unreachable (${String(e).slice(0, 120)}) — skipping remaining ${lang} tasks`); rows.push({ model, lang, p1, pFix, n: tasks.length, toks, fails, aborted: true }); continue modelLoop }
      let code = extract(raw, lang === 'til' ? 'til' : 'python')
      toks += o200k(code).length
      let r = (lang === 'til' ? runTil : runPy)(code, task)
      if (r.pass) { p1++; pFix++; process.stdout.write(`✓ ${model} ${lang} ${task.id}\n`); continue }
      let repaired = false
      for (let i = 0; i < REPAIR_ROUNDS && !repaired; i++) {
        messages.push({ role: 'assistant', content: '```' + lang + '\n' + code + '```' })
        messages.push({ role: 'user', content: `That failed. Error:\n${r.err}\nOutput ONLY the corrected program in a fence.` })
        try { code = extract(await chat(model, messages), lang === 'til' ? 'til' : 'python') }
        catch (e) { console.error(`! repair call failed: ${String(e).slice(0, 100)}`); break }
        r = (lang === 'til' ? runTil : runPy)(code, task)
        if (r.pass) { pFix++; repaired = true }
      }
      process.stdout.write(`${repaired ? '~' : '✗'} ${model} ${lang} ${task.id}${repaired ? ' (repaired)' : ''}\n`)
      if (!r.pass) fails.push({ task: task.id, err: (r.err || '').slice(0, 300), code })
    }
    rows.push({ model, lang, p1, pFix, n: tasks.length, toks, fails })
  }
}

const L = ['# til eval — write-from-card vs native python', '',
  `${tasks.length} tasks · temperature 0 · one repair round with the error fed back · stdout must match byte-exactly`, '',
  '| model | lang | pass@1 | pass@fix | gen tokens (o200k) |', '|---|---|---:|---:|---:|']
for (const r of rows) L.push(`| ${r.model} | ${r.lang} | ${r.p1}/${r.n} | ${r.pFix}/${r.n} | ${r.toks} |`)
L.push('')
for (const r of rows.filter(x => x.fails.length)) {
  L.push(`## fails: ${r.model} / ${r.lang}`)
  for (const f of r.fails) L.push(`- **${f.task}**: ${f.err.split('\n')[0]}`)
  L.push('')
}
fs.writeFileSync(process.env.EVAL_OUT || path.join(here, 'results.md'), L.join('\n') + '\n')
console.log('\nwrote eval/results.md')
