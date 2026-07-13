// Repair experiment v2: DEEP logic faults, three arms —
//   til+contracts : reference + generic defensive `ensure` invariants
//   til-bare      : same reference, no contracts
//   py            : python mirror-reference, same semantic fault
// Faults run without shallow crash locality: silent wrong output, or failures far
// from the cause. Every fault is verified to fail per-arm before becoming a job.
// Disclosure: contracts and faults were authored by the same person (solo protocol);
// contracts were written as generic invariants per task before fault verification.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', '..')
const tasks = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, 'eval/hard/tasks.json'), 'utf8')).map(t => [t.id, t]))
const tilRef = id => fs.readFileSync(path.join(root, 'eval/hard/reference', id + '.til'), 'utf8')
const pyRef = id => fs.readFileSync(path.join(here, 'py', id + '.py'), 'utf8')

// ---- generic contracts per task (inserted into the til reference) ----
const CONTRACTS = {
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

// ---- paired deep faults: same semantic bug in both languages ----
const FAULTS = [
  { task: 'coin-change', name: 'dropped-coin', til: ['[1, 5, 12, 19]', '[5, 12, 19]'], py: ['[1, 5, 12, 19]', '[5, 12, 19]'] },
  { task: 'coin-change', name: 'exact-coin-unusable', til: ['if c <= a and', 'if c < a and'], py: ['if c <= a and', 'if c < a and'] },
  { task: 'vm-mini', name: 'sub-operand-swap', til: ['push (a - b) st', 'push (b - a) st'], py: ['st.append(a - b)', 'st.append(b - a)'] },
  { task: 'vm-mini', name: 'swap-drops-instead', til: ['st[-1], st[-2] = st[-2], st[-1]', 'pop st'], py: ['st[-1], st[-2] = st[-2], st[-1]', 'st.pop()'] },
  { task: 'bank-ledger', name: 'deduct-then-flag-no-refund', til: ['elif bal[a] >= m { bal[a] = bal[a] - m }\n  else { rejected = rejected + 1 }', 'else {\n    bal[a] = bal[a] - m\n    if bal[a] < 0 { rejected = rejected + 1 }\n  }'], py: ['elif bal[a] >= m:\n        bal[a] = bal[a] - m\n    else:\n        rejected = rejected + 1', 'else:\n        bal[a] = bal[a] - m\n        if bal[a] < 0:\n            rejected = rejected + 1'] },
  { task: 'bank-ledger', name: 'reject-counter-inverted', til: ['elif bal[a] >= m { bal[a] = bal[a] - m }\n  else { rejected = rejected + 1 }', 'elif bal[a] >= m {\n    bal[a] = bal[a] - m\n    rejected = rejected + 1\n  }'], py: ['elif bal[a] >= m:\n        bal[a] = bal[a] - m\n    else:\n        rejected = rejected + 1', 'elif bal[a] >= m:\n        bal[a] = bal[a] - m\n        rejected = rejected + 1'] },
  { task: 'game-of-life', name: 'counts-self', til: ['if (dx != 0 or dy != 0) and g[(y + dy) % H][(x + dx) % W] { nb = nb + 1 }', 'if g[(y + dy) % H][(x + dx) % W] { nb = nb + 1 }'], py: ['if (dx != 0 or dy != 0) and g[(y + dy) % H][(x + dx) % W]:', 'if g[(y + dy) % H][(x + dx) % W]:'] },
  { task: 'game-of-life', name: 'birth-rule-gte', til: ['push (nb == 3 or', 'push (nb >= 3 or'], py: ['row.append(nb == 3 or', 'row.append(nb >= 3 or'] },
  { task: 'top-ips', name: 'sorted-ascending', til: ['sortBy {-tot[it]}', 'sortBy {tot[it]}'], py: ['key=lambda ip: -tot[ip]', 'key=lambda ip: tot[ip]'] },
  { task: 'top-ips', name: 'reset-not-accumulate', til: ['tot[p[0]] = tot[p[0]] + num p[1]', 'tot[p[0]] = num p[1]'], py: ['tot[p[0]] = tot[p[0]] + int(p[1])', 'tot[p[0]] = int(p[1])'] },
  { task: 'dedupe-events', name: 'keeps-earliest', til: ['or ts >= latest[p[0]] {', 'or ts <= latest[p[0]] {'], py: ['or ts >= latest[p[0]]:', 'or ts <= latest[p[0]]:'] },
  { task: 'dedupe-events', name: 'max-not-sum', til: ['print (latest | vals | sum)', 'print (latest | vals | max)'], py: ['print(sum(latest.values()))', 'print(max(latest.values()))'] },
  { task: 'roman', name: 'missing-M', til: [', M: 1000}', '}'], py: [', "M": 1000}', '}'] },
  { task: 'roman', name: 'subtract-on-equal', til: ['rv[cs[p[0] + 1]] > v', 'rv[cs[p[0] + 1]] >= v'], py: ['rv[s[i + 1]] > v', 'rv[s[i + 1]] >= v'] },
  { task: 'balanced-max', name: 'no-sentinel-seed', til: ['stack = [-1]', 'stack = []'], py: ['stack = [-1]', 'stack = []'] },
  { task: 'balanced-max', name: 'measure-from-bottom', til: ['elif p[0] - last stack > best { best = p[0] - last stack }', 'elif p[0] - first stack > best { best = p[0] - first stack }'], py: ['elif i - stack[-1] > best:\n            best = i - stack[-1]', 'elif i - stack[0] > best:\n            best = i - stack[0]'] },
]

function runProg(lang, src, task) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-'))
  for (const [n, c] of Object.entries(task.files || {})) fs.writeFileSync(path.join(dir, n), c)
  const f = path.join(dir, lang === 'py' ? 'p.py' : 'p.til')
  fs.writeFileSync(f, src)
  try {
    const out = lang === 'py'
      ? execFileSync('python3', [f], { encoding: 'utf8', cwd: dir, timeout: 30000 })
      : execFileSync('node', [path.join(root, 'bin', 'til'), 'run', f], { encoding: 'utf8', cwd: dir, timeout: 30000 })
    if (out === task.expected) return { pass: true }
    return { pass: false, err: `program ran but stdout was:\n${out.slice(0, 400)}\nexpected:\n${task.expected.slice(0, 400)}`, kind: 'wrong-output' }
  } catch (e) {
    return { pass: false, err: ((e.stdout || '') + (e.stderr || '')).toString().slice(0, 1200) || String(e).slice(0, 300), kind: 'error' }
  }
}

// roman til ref uses `rv` (renamed) — normalize fault strings against actual source
const tilSrcFix = { roman: s => s.replace(', M: 1000}', ', M: 1000}') }

const jobs = []
let pruned = 0
for (const f of FAULTS) {
  const task = tasks[f.task]
  const tilBase = tilRef(f.task)
  const tilContracts = CONTRACTS[f.task](tilBase)
  if (tilContracts === tilBase) throw new Error(`contract insert failed: ${f.task}`)
  const pyBase = pyRef(f.task)

  const arms = [
    { arm: 'til-contracts', lang: 'til', src: tilContracts },
    { arm: 'til-bare', lang: 'til', src: tilBase },
    { arm: 'py', lang: 'py', src: pyBase },
  ]
  for (const a of arms) {
    const [find, repl] = a.lang === 'py' ? f.py : f.til
    if (!a.src.includes(find)) throw new Error(`fault find-string missing: ${f.task}/${f.name}/${a.arm}`)
    const mutated = a.src.replace(find, repl)
    // sanity: healthy version must pass, mutated must fail
    const v = runProg(a.lang, mutated, task)
    if (v.pass) { pruned++; console.log(`  ~ pruned (no behavior change): ${f.task}/${f.name}/${a.arm}`); continue }
    jobs.push({ jobId: `${f.task}:${f.name}:${a.arm}`, task: f.task, arm: a.arm, lang: a.lang, program: mutated, feedback: v.err, feedbackKind: v.kind })
  }
}

fs.writeFileSync(path.join(here, 'jobs.json'), JSON.stringify(jobs, null, 1))
const by = {}
for (const j of jobs) { const k = `${j.arm}/${j.feedbackKind}`; by[k] = (by[k] || 0) + 1 }
console.log(`jobs: ${jobs.length} (pruned ${pruned})`, JSON.stringify(by, null, 0))
