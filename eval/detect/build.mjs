// Detection-rate experiment substrate (the reframed N3, per eval/repair2/results.md):
// in the wild there is NO expected-output oracle. A reviewer sees only the task, the
// program, and what it printed when run once. Question: which design lets an agent
// notice that a program is silently wrong?
//   arms: til+contracts (ensure fires → error text) · til-bare · python
//   items: 45 faulty programs (deep faults from repair2) + healthy counterparts
// Ground truth is known here; reviewers never see it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', '..')
const tasks = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, 'eval/hard/tasks.json'), 'utf8')).map(t => [t.id, t]))
const jobs = JSON.parse(fs.readFileSync(path.join(root, 'eval/repair2/jobs.json'), 'utf8'))

function capture(lang, src, task) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'det-'))
  for (const [n, c] of Object.entries(task.files || {})) fs.writeFileSync(path.join(dir, n), c)
  const f = path.join(dir, lang === 'py' ? 'p.py' : 'p.til')
  fs.writeFileSync(f, src)
  try {
    const out = lang === 'py'
      ? execFileSync('python3', [f], { encoding: 'utf8', cwd: dir, timeout: 30000 })
      : execFileSync('node', [path.join(root, 'bin', 'til'), 'run', f], { encoding: 'utf8', cwd: dir, timeout: 30000 })
    return { kind: 'output', text: out.slice(0, 1200) }
  } catch (e) {
    // what an agent would see: stdout so far + the error text. NO expected-output anywhere.
    return { kind: 'error', text: (((e.stdout || '') + (e.stderr || '')).toString()).slice(0, 1200) }
  }
}

const items = []
for (const j of jobs) {
  const cap = capture(j.lang, j.program, tasks[j.task])
  items.push({ id: `faulty:${j.jobId}`, task: j.task, arm: j.arm, lang: j.lang, truth: 'buggy', program: j.program, runKind: cap.kind, runText: cap.text })
}

// healthy counterparts: one per task × arm (reconstructed exactly as in repair2/build.mjs)
const CONTRACTS = { // same inserts as repair2/build.mjs
  'coin-change': s => s.replace('  push best dp', '  ensure best < 999999999\n  push best dp'),
  'vm-mini': s => s.replace('}\nprint (last st)', '  ensure len st >= 1\n}\nprint (last st)'),
  'bank-ledger': s => s.replace('  else { rejected = rejected + 1 }\n}', '  else { rejected = rejected + 1 }\n  ensure bal[a] >= 0\n}'),
  'game-of-life': s => s.replace('      push (nb == 3 or', '      ensure nb <= 8\n      push (nb == 3 or'),
  'top-ips': s => s.replace(
    'for ip in (order | sortBy {-tot[it]} | take 3) { print "{ip} {tot[ip]}" }',
    'top3 = order | sortBy {-tot[it]} | take 3\nensure tot[top3[0]] >= tot[top3[2]]\nfor ip in top3 { print "{ip} {tot[ip]}" }'),
  'dedupe-events': s => s.replace(
    '  if not has p[0] latest or ts >= latest[p[0]] { latest[p[0]] = ts }',
    '  if not has p[0] latest or ts >= latest[p[0]] { latest[p[0]] = ts }\n  ensure latest[p[0]] >= ts'),
  'roman': s => s.replace('    v = rv[p[1]]', '    v = rv[p[1]]\n    ensure v'),
  'balanced-max': s => s.replace('print best', 'ensure best % 2 == 0\nprint best'),
}
for (const id of Object.keys(CONTRACTS)) {
  const tilBase = fs.readFileSync(path.join(root, 'eval/hard/reference', id + '.til'), 'utf8')
  const pyBase = fs.readFileSync(path.join(root, 'eval/repair2/py', id + '.py'), 'utf8')
  const variants = [
    { arm: 'til-contracts', lang: 'til', src: CONTRACTS[id](tilBase) },
    { arm: 'til-bare', lang: 'til', src: tilBase },
    { arm: 'py', lang: 'py', src: pyBase },
  ]
  for (const v of variants) {
    const cap = capture(v.lang, v.src, tasks[id])
    if (cap.kind !== 'output') throw new Error(`healthy program errored: ${id}/${v.arm}`)
    items.push({ id: `healthy:${id}:${v.arm}`, task: id, arm: v.arm, lang: v.lang, truth: 'correct', program: v.src, runKind: cap.kind, runText: cap.text })
  }
}

fs.writeFileSync(path.join(here, 'items.json'), JSON.stringify(items, null, 1))
const by = {}
for (const i of items) { const k = `${i.arm}/${i.truth}/${i.runKind}`; by[k] = (by[k] || 0) + 1 }
console.log(`items: ${items.length}`, JSON.stringify(by, null, 0))
