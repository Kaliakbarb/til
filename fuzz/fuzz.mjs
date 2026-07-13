// til fuzzer — N6 guard: no input may ever escape the error model.
// Two modes, both in-process for speed:
//   generative: random programs from the grammar's constructs (loop-bounded by design)
//   mutational: token-level corruptions of the real corpus (tests/, examples/, bench/)
// A finding = anything other than {clean run | TilError}: raw JS errors, hangs (guarded
// by construction), or checker/runtime disagreement crashes.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, check, run, runEgs, TilError } from '../src/til.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const N_GEN = Number(process.argv[2] || 200_000)
const N_MUT = Number(process.argv[3] || 20_000)

// deterministic PRNG so every finding is reproducible from its seed
let S = 0x1234
const rnd = () => (S = (S * 1664525 + 1013904223) >>> 0) / 4294967296
const pick = a => a[Math.floor(rnd() * a.length)]
const ri = n => Math.floor(rnd() * n)

const NAMES = ['x', 'y', 'xs', 'm', 'f', 'acc', 'n', 's']
const BUILTINS = ['sum', 'len', 'sort', 'uniq', 'rev', 'first', 'last', 'trim', 'upper', 'words', 'lines', 'keys', 'vals', 'counts', 'flat', 'mean', 'median', 'json', 'tojson', 'str', 'num', 'abs', 'floor', 'type', 'empty', 'enum']
const BUILTINS2 = ['map', 'keep', 'take', 'skip', 'split', 'join', 'push', 'has', 'find', 'pos', 'get', 'zip', 'group', 'rep', 'starts', 'rall', 'rmatch', 'top', 'pow', 'roundTo']
const OPS = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', 'and', 'or', 'in']

function atom(d) {
  const r = rnd()
  if (d <= 0 || r < 0.25) return pick(['0', '1', '2', '-3', '1.5', 'true', 'false', 'null', '"a"', '"b c"', "'x{'", '[]', '{}', '[1, 2, 3]', '["a", "b"]', '{a: 1, b: 2}', pick(NAMES)])
  if (r < 0.4) return `[${atom(d - 1)}, ${atom(d - 1)}]`
  if (r < 0.5) return `{k: ${atom(d - 1)}, v: ${atom(d - 1)}}`
  if (r < 0.6) return `(${expr(d - 1)})`
  if (r < 0.7) return `{it ${pick(['+', '*', '=='])} ${atom(d - 1)}}`
  if (r < 0.8) return `{a b -> ${expr(d - 1)}}`
  if (r < 0.9) return `if ${expr(d - 1)} { ${expr(d - 1)} } else { ${expr(d - 1)} }`
  return `match ${atom(d - 1)} {\n${atom(0)} -> ${atom(d - 1)}\n_ -> ${atom(d - 1)}\n}`
}

function expr(d) {
  const r = rnd()
  if (d <= 0 || r < 0.3) return atom(d)
  if (r < 0.5) return `${atom(d - 1)} ${pick(OPS)} ${atom(d - 1)}`
  if (r < 0.65) return `${pick(BUILTINS)} ${atom(d - 1)}`
  if (r < 0.8) return `${pick(BUILTINS2)} ${atom(d - 1)} ${atom(d - 1)}`
  if (r < 0.9) return `${atom(d - 1)} | ${pick(BUILTINS)}`
  return `${expr(d - 1)} catch ${atom(d - 1)}`
}

function stmt(d) {
  const r = rnd()
  if (r < 0.35) return `${pick(NAMES)} = ${expr(d)}`
  if (r < 0.45) return `${pick(NAMES)}, ${pick(NAMES)} = ${expr(d - 1)}, ${expr(d - 1)}`
  if (r < 0.55) return `fn ${pick(['g', 'h', 'p'])} a${rnd() < 0.5 ? ' b' : ''} = ${expr(d)}`
  if (r < 0.65) return `for ${pick(NAMES)} in range 0 ${ri(20)} { ${stmt(d - 1)} }`
  if (r < 0.72) return `if ${expr(d - 1)} { ${stmt(d - 1)} } else { ${stmt(d - 1)} }`
  if (r < 0.78) return `ensure ${expr(d - 1)}`
  if (r < 0.84) return `eg ${expr(d - 1)}`
  if (r < 0.9) return `print (${expr(d - 1)})`
  return expr(d)
}

function program() {
  const n = 1 + ri(6)
  const lines = []
  for (let i = 0; i < n; i++) lines.push(stmt(2 + ri(2)))
  return lines.join('\n') + '\n'
}

const host = { print: () => {}, read: () => 'a b\n1 2\n', write: () => {}, append: () => {}, env: () => null, stdin: () => '', now: () => 0, rand: rnd }

const findings = []
function tryOne(src, tag, seed) {
  try {
    const ast = parse(src, { file: 'fuzz.til' })
    check(ast)
    const { rt } = run(src, { ast, host, file: 'fuzz.til', args: [] })
    runEgs(rt)
  } catch (e) {
    if (e instanceof TilError) return // fail-fast is correct behavior
    findings.push({ tag, seed, error: String(e?.stack || e).slice(0, 300), src: src.slice(0, 400) })
  }
}

console.log(`fuzz: ${N_GEN} generated + ${N_MUT} mutated programs`)
const t0 = Date.now()
for (let i = 0; i < N_GEN; i++) {
  const seed = S
  tryOne(program(), 'gen', seed)
  if (i % 25000 === 0 && i) console.log(`  gen ${i} (${findings.length} findings, ${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}

// mutation corpus: real programs with random single-token corruption
const corpus = []
for (const dir of ['tests', 'examples', 'bench/tasks', 'games/flappy', 'eval/reference', 'scripts']) {
  const walk = d => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name)
      if (f.isDirectory()) walk(p)
      else if (f.name.endsWith('.til')) corpus.push(fs.readFileSync(p, 'utf8'))
    }
  }
  walk(path.join(root, dir))
}
const GLYPHS = ['{', '}', '(', ')', '[', ']', '"', "'", '|', '=', '-', '.', ',', '\n', ' ', 'x', '0', '#', '\\', '$']
for (let i = 0; i < N_MUT; i++) {
  const seed = S
  let src = pick(corpus)
  const edits = 1 + ri(3)
  for (let e = 0; e < edits; e++) {
    const pos = ri(src.length)
    const op = rnd()
    if (op < 0.4) src = src.slice(0, pos) + pick(GLYPHS) + src.slice(pos)          // insert
    else if (op < 0.7) src = src.slice(0, pos) + src.slice(pos + 1 + ri(3))        // delete
    else src = src.slice(0, pos) + pick(GLYPHS) + src.slice(pos + 1)               // replace
  }
  tryOne(src, 'mut', seed)
  if (i % 5000 === 0 && i) console.log(`  mut ${i} (${findings.length} findings)`)
}

const secs = ((Date.now() - t0) / 1000).toFixed(0)
if (findings.length) {
  fs.writeFileSync(path.join(here, 'findings.json'), JSON.stringify(findings, null, 1))
  console.log(`✗ ${findings.length} raw-error findings in ${secs}s → fuzz/findings.json`)
  process.exit(1)
}
console.log(`✓ ${N_GEN + N_MUT} programs, zero raw host errors, ${secs}s`)
