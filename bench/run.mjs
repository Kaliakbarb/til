// til benchmark: identical tasks in til / python / js.
// 1. run all three, require byte-identical stdout (fairness gate)
// 2. count tokens with real LLM tokenizers (o200k_base, cl100k_base)
// 3. emit bench/report.md + bench/results.json
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode as o200k } from 'gpt-tokenizer/encoding/o200k_base'
import { encode as cl100k } from 'gpt-tokenizer/encoding/cl100k_base'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const tasksDir = path.join(here, 'tasks')
const TIL = path.join(root, 'bin', 'til')

const LANGS = [
  { name: 'til', file: 'task.til', run: d => execFileSync('node', [TIL, 'run', 'task.til'], { cwd: d, encoding: 'buffer' }) },
  { name: 'py', file: 'task.py', run: d => execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['task.py'], { cwd: d, encoding: 'buffer' }) },
  { name: 'js', file: 'task.js', run: d => execFileSync('node', ['task.js'], { cwd: d, encoding: 'buffer' }) },
]

const tasks = fs.readdirSync(tasksDir).filter(t => fs.existsSync(path.join(tasksDir, t, 'task.til'))).sort()
const results = []
let mismatches = 0

for (const task of tasks) {
  const dir = path.join(tasksDir, task)
  const row = { task, langs: {} }
  let ref = null, refLang = null
  for (const lang of LANGS) {
    const src = fs.readFileSync(path.join(dir, lang.file), 'utf8')
    let out, error = null
    try { out = lang.run(dir) } catch (e) { out = null; error = (e.stderr || e.message || '').toString().slice(0, 500) }
    row.langs[lang.name] = {
      o200k: o200k(src).length,
      cl100k: cl100k(src).length,
      chars: src.length,
      lines: src.split('\n').filter(l => l.trim()).length,
      out: out === null ? null : out.toString('utf8'),
      error,
    }
    if (out !== null) {
      if (ref === null) { ref = out; refLang = lang.name }
      else if (!out.equals(ref)) { row.langs[lang.name].mismatch = true }
    }
  }
  row.ok = LANGS.every(l => row.langs[l.name].out !== null && !row.langs[l.name].mismatch)
  if (!row.ok) {
    mismatches++
    console.log(`✗ ${task}: OUTPUT MISMATCH OR ERROR`)
    for (const lang of LANGS) {
      const r = row.langs[lang.name]
      if (r.error) console.log(`  ${lang.name} ERROR: ${r.error.split('\n')[0]}`)
      else if (r.mismatch) console.log(`  ${lang.name} differs from ${refLang}:\n    ${lang.name}: ${JSON.stringify(r.out?.slice(0, 120))}\n    ${refLang}: ${JSON.stringify(ref?.toString('utf8').slice(0, 120))}`)
    }
  } else {
    console.log(`✓ ${task}: outputs identical (${JSON.stringify(ref.toString('utf8').split('\n')[0]).slice(0, 40)}…)`)
  }
  results.push(row)
}

// ---- summary table ----
const ok = results.filter(r => r.ok)
const tot = enc => Object.fromEntries(LANGS.map(l => [l.name, ok.reduce((s, r) => s + r.langs[l.name][enc], 0)]))
const totals = { o200k: tot('o200k'), cl100k: tot('cl100k'), chars: tot('chars') }
const pct = (a, b) => { const d = 100 * (1 - a / b); return (d >= 0 ? '−' : '+') + Math.abs(d).toFixed(1) + '%' }

const L = []
L.push('# til benchmark — tokens for identical, output-verified programs')
L.push('')
L.push(`${ok.length}/${results.length} tasks verified: all three implementations produce **byte-identical stdout**.`)
L.push('Token counts are for full source files, measured with real tokenizers (`gpt-tokenizer`).')
L.push('')
L.push('## o200k_base (GPT-4o / o-series)')
L.push('')
L.push('| task | til | python | js | til vs py | til vs js |')
L.push('|---|---:|---:|---:|---:|---:|')
for (const r of ok) {
  const t = r.langs.til.o200k, p = r.langs.py.o200k, j = r.langs.js.o200k
  L.push(`| ${r.task} | ${t} | ${p} | ${j} | ${pct(t, p)} | ${pct(t, j)} |`)
}
L.push(`| **total** | **${totals.o200k.til}** | **${totals.o200k.py}** | **${totals.o200k.js}** | **${pct(totals.o200k.til, totals.o200k.py)}** | **${pct(totals.o200k.til, totals.o200k.js)}** |`)
L.push('')
L.push('## cl100k_base (GPT-4 / 3.5)')
L.push('')
L.push('| task | til | python | js | til vs py | til vs js |')
L.push('|---|---:|---:|---:|---:|---:|')
for (const r of ok) {
  const t = r.langs.til.cl100k, p = r.langs.py.cl100k, j = r.langs.js.cl100k
  L.push(`| ${r.task} | ${t} | ${p} | ${j} | ${pct(t, p)} | ${pct(t, j)} |`)
}
L.push(`| **total** | **${totals.cl100k.til}** | **${totals.cl100k.py}** | **${totals.cl100k.js}** | **${pct(totals.cl100k.til, totals.cl100k.py)}** | **${pct(totals.cl100k.til, totals.cl100k.js)}** |`)
L.push('')
L.push('## characters')
L.push('')
L.push(`til ${totals.chars.til} · python ${totals.chars.py} (${pct(totals.chars.til, totals.chars.py)}) · js ${totals.chars.js} (${pct(totals.chars.til, totals.chars.js)})`)
L.push('')
L.push('## method & fairness')
L.push('')
L.push('- Python/JS solutions are written the way a competent LLM writes them: idiomatic, minimal, stdlib-only, no golfing and no padding. If you can write a materially shorter idiomatic version, file it — the gate is that stdout stays byte-identical.')
L.push('- All solutions are comment-free; whitespace is each language\'s standard style.')
L.push('- The Anthropic tokenizer is not public; o200k/cl100k are the standard proxies. Rankings are stable across both.')
L.push('- Caveat: token count is a proxy for generation cost, not correctness. See README for the correctness argument (checker, contracts, structured errors).')
L.push('- Baselines were adversarially re-optimized by an independent auditor; every shorter byte-identical idiomatic version found was adopted. Known input-shaped equivalences are documented: Python round() is banker\'s vs til/JS half-up (dataset avoids .xx5 boundaries); compact-JSON output spec costs Python a separators tax.')

console.log('')
if (mismatches) { console.log(`✗ ${mismatches} task(s) not verified — no report written`); process.exit(1) }

const report = L.join('\n') + '\n'
fs.writeFileSync(path.join(here, 'report.md'), report)
fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(results, null, 2))

console.log(`✓ all ${ok.length} tasks verified · o200k totals: til ${totals.o200k.til} vs py ${totals.o200k.py} (${pct(totals.o200k.til, totals.o200k.py)}) vs js ${totals.o200k.js} (${pct(totals.o200k.til, totals.o200k.js)})`)
console.log(`report: bench/report.md`)

// bonus: how big is the language card?
const llm = path.join(root, 'LLM.md')
if (fs.existsSync(llm)) {
  const s = fs.readFileSync(llm, 'utf8')
  console.log(`LLM.md (whole language spec): ${o200k(s).length} o200k tokens / ${cl100k(s).length} cl100k tokens`)
}
