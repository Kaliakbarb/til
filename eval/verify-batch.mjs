// Verify a batch of generated programs against eval/tasks.json.
// Input:  JSON file [{id, model, lang: "til"|"py", variant?, program}]
// Output: same records + {pass, err} — err is the repair-round feedback
//         (til: structured check/run error; py: stderr), written to <input>.results.json
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const TIL = path.join(here, '..', 'bin', 'til')
const tasks = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(here, 'tasks.json'), 'utf8')).map(t => [t.id, t]))

function sandbox(task) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'til-eval-'))
  for (const [name, content] of Object.entries(task.files || {})) fs.writeFileSync(path.join(dir, name), content)
  return dir
}

export function runTil(code, task) {
  const dir = sandbox(task)
  const f = path.join(dir, 'prog.til')
  fs.writeFileSync(f, code)
  try {
    const chk = execFileSync('node', [TIL, 'check', f, '--json'], { encoding: 'utf8', cwd: dir })
    const cj = JSON.parse(chk.trim().split('\n').pop())
    if (cj.ok === false) return { pass: false, err: JSON.stringify(cj.errors?.[0] ?? cj) }
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).toString()
    return { pass: false, err: out.slice(0, 800) || String(e) }
  }
  try {
    const out = execFileSync('node', [TIL, 'run', f], { encoding: 'utf8', cwd: dir, timeout: 10000 })
    return { pass: out === task.expected, err: out === task.expected ? null : `program ran but stdout was:\n${out.slice(0, 400)}\nexpected:\n${task.expected}` }
  } catch (e) {
    return { pass: false, err: ((e.stdout || '') + (e.stderr || '')).toString().slice(0, 800) || String(e) }
  }
}

export function runPy(code, task) {
  const dir = sandbox(task)
  const f = path.join(dir, 'prog.py')
  fs.writeFileSync(f, code)
  try {
    const out = execFileSync('python3', [f], { encoding: 'utf8', cwd: dir, timeout: 10000 })
    return { pass: out === task.expected, err: out === task.expected ? null : `program ran but stdout was:\n${out.slice(0, 400)}\nexpected:\n${task.expected}` }
  } catch (e) {
    return { pass: false, err: ((e.stdout || '') + (e.stderr || '')).toString().slice(0, 800) || String(e) }
  }
}

const input = process.argv[2]
if (input) {
  const batch = JSON.parse(fs.readFileSync(input, 'utf8'))
  const results = batch.map(r => {
    const task = tasks[r.id]
    if (!task) return { ...r, pass: false, err: 'unknown task id' }
    const code = (r.program || '').trim() + '\n'
    const v = r.lang === 'py' ? runPy(code, task) : runTil(code, task)
    return { ...r, pass: v.pass, err: v.err }
  })
  const outPath = input.replace(/\.json$/, '') + '.results.json'
  fs.writeFileSync(outPath, JSON.stringify(results, null, 1))
  const groups = {}
  for (const r of results) {
    const k = `${r.model}/${r.lang}${r.variant ? ':' + r.variant : ''}`
    groups[k] = groups[k] || { pass: 0, n: 0 }
    groups[k].n++; if (r.pass) groups[k].pass++
  }
  for (const [k, g] of Object.entries(groups)) console.log(`${k}: ${g.pass}/${g.n}`)
  console.log(`→ ${outPath}`)
}
