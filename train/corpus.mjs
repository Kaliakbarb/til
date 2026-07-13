// Self-validated training corpus for a til-native small model (MultiPL-T-style):
// parametric task templates → til program → EXECUTED in-process → only verified
// (instruction, files, program, output) triples are kept.
// Usage: node train/corpus.mjs [count]   → train/corpus.jsonl
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, check, run } from '../src/til.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const N = Number(process.argv[2] || 25000)

let S = 0xBEEF
const rnd = () => (S = (S * 1664525 + 1013904223) >>> 0) / 4294967296
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = a => a[Math.floor(rnd() * a.length)]
const WORDS = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike nov oscar papa'.split(' ')
const REGIONS = ['eu', 'us', 'kz', 'sg', 'uk', 'jp', 'br']
const nums = (n, lo, hi) => Array.from({ length: n }, () => ri(lo, hi))

// each template: () => { instruction, files, program }
const TEMPLATES = [
  () => { // sum with a filter
    const xs = nums(ri(6, 15), 1, 99), k = ri(2, 5)
    return {
      instruction: `Read numbers.txt (one integer per line). Print the sum of the numbers divisible by ${k}.`,
      files: { 'numbers.txt': xs.join('\n') + '\n' },
      program: `read "numbers.txt" | lines | map num | keep {it % ${k} == 0} | sum | print\n`,
    }
  },
  () => { // top-N word frequency
    const n = ri(2, 4)
    const text = Array.from({ length: ri(25, 60) }, () => pick(WORDS.slice(0, ri(4, 9)))).join(' ')
    return {
      instruction: `Read text.txt. Print the ${n} most frequent words, one per line as "<word> <count>", most frequent first (ties by first appearance).`,
      files: { 'text.txt': text + '\n' },
      program: `read "text.txt" | words | counts | top ${n} | each {p -> print "{p.k} {p.v}"}\n`,
    }
  },
  () => { // csv column aggregate
    const rows = Array.from({ length: ri(6, 14) }, () => `${pick(REGIONS.slice(0, ri(3, 5)))},${ri(10, 500)}`)
    return {
      instruction: 'Read sales.csv (header region,amount). Print each region as "<region> <total>" in first-seen order.',
      files: { 'sales.csv': 'region,amount\n' + rows.join('\n') + '\n' },
      program: `rows = read "sales.csv" | lines | skip 1 | map (split ",")\nfor p in (group {it[0]} rows) {\n  print "{p.k} {p.v | map {num it[1]} | sum}"\n}\n`,
    }
  },
  () => { // dedupe + sort
    const ws = Array.from({ length: ri(8, 20) }, () => pick(WORDS))
    return {
      instruction: 'Read words.txt (whitespace-separated). Print the unique words sorted ascending, one per line.',
      files: { 'words.txt': ws.join(' ') + '\n' },
      program: 'read "words.txt" | words | uniq | sort | each print\n',
    }
  },
  () => { // stats
    const xs = nums(ri(5, 12), 1, 200)
    return {
      instruction: 'Read n.txt (one number per line). Print "count <n>", then "mean <m>" and "max <max>" (mean rounded to 2 decimals).',
      files: { 'n.txt': xs.join('\n') + '\n' },
      program: `xs = read "n.txt" | lines | map num\nprint "count {len xs}"\nprint "mean {roundTo 2 (mean xs)}"\nprint "max {max xs}"\n`,
    }
  },
  () => { // grep + count with regex
    const lvls = ['INFO', 'WARN', 'ERROR']
    const linesArr = Array.from({ length: ri(8, 25) }, (_, i) => `${pick(lvls)} event${i}`)
    const target = pick(['ERROR', 'WARN'])
    return {
      instruction: `Read app.log. Print the number of lines containing "${target}", then each such line.`,
      files: { 'app.log': linesArr.join('\n') + '\n' },
      program: `hits = read "app.log" | lines | keep {has "${target}" it}\nprint (len hits)\nhits | each print\n`,
    }
  },
  () => { // fizz-style transform
    const a = ri(2, 4), b = ri(5, 7), n = ri(15, 40)
    return {
      instruction: `For numbers 1..${n}: print "X" if divisible by ${a}, "Y" if divisible by ${b}, "XY" if both, else the number — one per line.`,
      files: {},
      program: `for i in range 1 ${n + 1} {\n  print (if i % ${a * b} == 0 { "XY" } elif i % ${a} == 0 { "X" } elif i % ${b} == 0 { "Y" } else { i })\n}\n`,
    }
  },
  () => { // json reshape
    const items = Array.from({ length: ri(3, 7) }, (_, i) => ({ name: pick(WORDS) + i, qty: ri(1, 50), ok: rnd() < 0.6 }))
    return {
      instruction: 'Read items.json (a JSON list of {name, qty, ok}). Print a compact JSON list of the names where ok is true, preserving order.',
      files: { 'items.json': JSON.stringify(items) },
      program: `items = json (read "items.json")\nprint (tojson (items | keep {it.ok} | map {it.name}))\n`,
    }
  },
  () => { // running accumulation with multi-assign
    const n = ri(8, 16)
    return {
      instruction: `Print the first ${n} Fibonacci numbers (starting 0 1) on one line, space-separated.`,
      files: {},
      program: `a, b = 0, 1\nout = []\nfor _ in range 0 ${n} {\n  push a out\n  a, b = b, a + b\n}\nprint (join " " out)\n`,
    }
  },
  () => { // enum + line numbers
    const linesArr = Array.from({ length: ri(5, 12) }, () => pick(WORDS) + ' ' + pick(WORDS))
    const needle = pick(linesArr).split(' ')[0]
    return {
      instruction: `Read notes.txt. Print each line containing "${needle}" as "<1-based-line-number>: <line>".`,
      files: { 'notes.txt': linesArr.join('\n') + '\n' },
      program: `for p in (read "notes.txt" | lines | enum | keep {has "${needle}" it[1]}) {\n  print "{p[0] + 1}: {p[1]}"\n}\n`,
    }
  },
  () => { // key=value config
    const keys = ['name', 'port', 'mode', 'path', 'level'].slice(0, ri(3, 5))
    const cfg = keys.map(k => `${k} = ${pick(WORDS)}${ri(0, 99)}`).join('\n')
    const want = pick(keys)
    return {
      instruction: `Read app.cfg (lines "key = value"). Print the value of the key "${want}" (trim whitespace).`,
      files: { 'app.cfg': cfg + '\n' },
      program: `for line in (read "app.cfg" | lines) {\n  p = split "=" line\n  if trim p[0] == "${want}" { print (trim p[1]) }\n}\n`,
    }
  },
  () => { // min/max record by field
    const rows = Array.from({ length: ri(4, 9) }, (_, i) => `${pick(WORDS)}${i} ${ri(10, 999)}`)
    return {
      instruction: 'Read scores.txt (lines "<name> <score>"). Print the name with the highest score as "<name> <score>".',
      files: { 'scores.txt': rows.join('\n') + '\n' },
      program: `best = read "scores.txt" | lines | map words | sortBy {num it[1]} | last\nprint "{best[0]} {best[1]}"\n`,
    }
  },
  () => { // string cleanup with contracts
    const raw = Array.from({ length: ri(5, 10) }, () => (rnd() < 0.3 ? '# note' : (rnd() < 0.2 ? '   ' : '  ' + pick(WORDS) + '  ')))
    return {
      instruction: 'Read raw.txt. Trim every line, drop empties and lines starting with "#", print the rest.',
      files: { 'raw.txt': raw.join('\n') + '\n' },
      program: `read "raw.txt" | lines | map trim | keep {it and not starts "#" it} | each print\n`,
    }
  },
  () => { // ensure + eg carrying fn
    const m = ri(2, 9)
    return {
      instruction: `Define a function that multiplies a number by ${m} with a contract that the input is a number, include an example test, then print the result for ${ri(3, 12)} — wait, print it for the input given in n.txt.`,
      files: { 'n.txt': String(ri(3, 12)) + '\n' },
      program: `fn scale x {\n  ensure type x == "num"\n  x * ${m}\n}\neg scale 2 == ${2 * m}\nprint (scale (num (trim (read "n.txt"))))\n`,
    }
  },
]

const out = fs.createWriteStream(path.join(here, 'corpus.jsonl'))
const host = files => ({
  print: null, // set per run
  read: p => { if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e } return files[p] },
  write: () => {}, append: () => {}, env: () => null, stdin: () => '', now: () => 0, rand: rnd,
})

let kept = 0, dropped = 0
const t0 = Date.now()
while (kept < N) {
  const t = pick(TEMPLATES)()
  try {
    const lines = []
    const h = host(t.files)
    h.print = s => lines.push(s)
    const ast = parse(t.program, { file: 'c.til' })
    const { errors } = check(ast)
    if (errors.length) { dropped++; continue }
    run(t.program, { ast, host: h, file: 'c.til', args: [] })
    const output = lines.join('\n') + (lines.length ? '\n' : '')
    if (!output.trim()) { dropped++; continue }
    out.write(JSON.stringify({ instruction: t.instruction, files: t.files, program: t.program, output }) + '\n')
    kept++
    if (kept % 5000 === 0) console.log(`  ${kept} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  } catch { dropped++ }
}
out.end()
console.log(`✓ corpus: ${kept} verified triples (${dropped} dropped) → train/corpus.jsonl (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
