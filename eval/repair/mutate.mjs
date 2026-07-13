// Repair-experiment substrate: inject controlled faults into KNOWN-CORRECT programs,
// keep only mutants that verifiably fail, and capture each language's native error
// feedback — til's structured error vs python's traceback — for the repair fleet.
//
// Corpus: the 8 easy-suite tasks, using eval/reference/*.til and the byte-verified
// python programs from the write-from-card eval (sonnet's, all pass=true).
// Mutation operators (one per mutant): name-typo · off-by-one · operator-swap · string-literal.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTil, runPy } from '../verify-batch.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const evalDir = path.join(here, '..')
const tasks = JSON.parse(fs.readFileSync(path.join(evalDir, 'tasks.json'), 'utf8'))
const gens = JSON.parse(fs.readFileSync(path.join(evalDir, 'generations.results.json'), 'utf8'))

let S = 0xC0FFEE
const rnd = () => (S = (S * 1664525 + 1013904223) >>> 0) / 4294967296
const pick = a => a[Math.floor(rnd() * a.length)]

const corpus = []
for (const t of tasks) {
  corpus.push({ id: t.id, lang: 'til', src: fs.readFileSync(path.join(evalDir, 'reference', t.id + '.til'), 'utf8') })
  const py = gens.find(g => g.id === t.id && g.lang === 'py' && g.model === 'sonnet' && g.pass)
  if (py) corpus.push({ id: t.id, lang: 'py', src: py.program.trim() + '\n' })
}

const IDENT = /[A-Za-z_][A-Za-z0-9_]{2,}/g
function typo(word) {
  const i = 1 + Math.floor(rnd() * (word.length - 2))
  const ops = [
    w => w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2),        // transpose
    w => w.slice(0, i) + w.slice(i + 1),                          // drop
    w => w.slice(0, i) + pick('aeiou'.split('')) + w.slice(i + 1) // swap letter
  ]
  const out = pick(ops)(word)
  return out === word || !out ? word + 'e' : out
}

const MUTATORS = {
  'name-typo': src => {
    const names = [...new Set(src.match(IDENT) || [])].filter(n => !['import', 'with', 'open', 'print', 'def', 'else', 'elif', 'for', 'while', 'return', 'true', 'false', 'null', 'True', 'False', 'None', 'not', 'and', 'or', 'in', 'if'].includes(n))
    if (!names.length) return null
    const name = pick(names)
    const occ = [...src.matchAll(new RegExp(`\\b${name}\\b`, 'g'))]
    if (!occ.length) return null
    const hit = pick(occ)
    return src.slice(0, hit.index) + typo(name) + src.slice(hit.index + name.length)
  },
  'off-by-one': src => {
    const nums = [...src.matchAll(/\b\d+\b/g)]
    if (!nums.length) return null
    const hit = pick(nums)
    const v = Number(hit[0]) + (rnd() < 0.5 ? 1 : -1)
    return src.slice(0, hit.index) + String(Math.max(0, v)) + src.slice(hit.index + hit[0].length)
  },
  'operator-swap': src => {
    const swaps = [['>=', '>'], ['<=', '<'], ['==', '!='], [' + ', ' - '], [' > ', ' >= '], [' < ', ' <= ']]
    const avail = swaps.filter(([a]) => src.includes(a))
    if (!avail.length) return null
    const [a, b] = pick(avail)
    const occ = [...src.matchAll(new RegExp(a.replace(/[+\-*=<>!]/g, m => '\\' + m), 'g'))]
    const hit = pick(occ)
    return src.slice(0, hit.index) + b + src.slice(hit.index + a.length)
  },
  'string-lit': src => {
    const strs = [...src.matchAll(/"([^"\\{}\n]{1,12})"/g)].filter(m => m[1].length > 0)
    if (!strs.length) return null
    const hit = pick(strs)
    const inner = hit[1]
    const corrupted = inner.length > 2 ? inner.slice(0, -1) : inner + inner[0]
    return src.slice(0, hit.index) + '"' + corrupted + '"' + src.slice(hit.index + hit[0].length)
  },
}

// minimal-feedback ablation: strip til's error down to code + line only
export function minimalize(err) {
  if (!err) return err
  const m = err.match(/error\[(\w+)\][^]*?:(\d+)/) || err.match(/"code":"(\w+)".*?"line":(\d+)/)
  if (m) return `error[${m[1]}] at line ${m[2]}`
  if (err.startsWith('program ran but stdout was')) return err // wrong-output info identical across arms
  return err.split('\n')[0]
}

const PER_PROGRAM = 5
const mutants = []
for (const prog of corpus) {
  const task = tasks.find(t => t.id === prog.id)
  const seen = new Set()
  let made = 0, attempts = 0
  while (made < PER_PROGRAM && attempts < 60) {
    attempts++
    const op = pick(Object.keys(MUTATORS))
    const mut = MUTATORS[op](prog.src)
    if (!mut || mut === prog.src || seen.has(mut)) continue
    seen.add(mut)
    const v = prog.lang === 'til' ? runTil(mut, task) : runPy(mut, task)
    if (v.pass) continue // silent mutant — the fault didn't change behavior; discard
    mutants.push({
      id: `${prog.id}:${prog.lang}:${made}`, task: prog.id, lang: prog.lang, op,
      program: mut, feedback: (v.err || '').slice(0, 1200),
      feedbackKind: v.err?.startsWith('program ran but stdout was') ? 'wrong-output' : 'error',
    })
    made++
  }
}

fs.writeFileSync(path.join(here, 'mutants.json'), JSON.stringify(mutants, null, 1))
const by = {}
for (const m of mutants) { const k = `${m.lang}/${m.feedbackKind}`; by[k] = (by[k] || 0) + 1 }
console.log(`mutants: ${mutants.length}`, JSON.stringify(by))
