// Token comparison for the three flappy implementations (same SPEC.md contract).
// Unlike bench/, game stdout can't be byte-compared — the fairness gate here is
// the shared spec checklist + each implementation's verification (see SPEC.md).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode as o200k } from 'gpt-tokenizer/encoding/o200k_base'
import { encode as cl100k } from 'gpt-tokenizer/encoding/cl100k_base'

const here = path.dirname(fileURLToPath(import.meta.url))
const files = { til: 'flappy.til', py: 'flappy.py', js: 'flappy.js' }
const out = {}
for (const [lang, f] of Object.entries(files)) {
  const src = fs.readFileSync(path.join(here, f), 'utf8')
  out[lang] = { o200k: o200k(src).length, cl100k: cl100k(src).length, chars: src.length, lines: src.split('\n').filter(l => l.trim()).length }
}
const pct = (a, b) => { const d = 100 * (1 - a / b); return (d >= 0 ? '−' : '+') + Math.abs(d).toFixed(1) + '%' }

fs.writeFileSync(path.join(here, 'tokens.json'), JSON.stringify(out, null, 2))
const webCopy = path.join(here, '..', '..', 'web', 'flappy.tokens.json')
fs.writeFileSync(webCopy, JSON.stringify(out))

const L = ['# flappy — token comparison (same game, same constants, per SPEC.md)', '',
  '| | til (web host) | python (pygame) | js (canvas) |', '|---|---:|---:|---:|',
  `| o200k tokens | **${out.til.o200k}** | ${out.py.o200k} (til ${pct(out.til.o200k, out.py.o200k)}) | ${out.js.o200k} (til ${pct(out.til.o200k, out.js.o200k)}) |`,
  `| cl100k tokens | **${out.til.cl100k}** | ${out.py.cl100k} (til ${pct(out.til.cl100k, out.py.cl100k)}) | ${out.js.cl100k} (til ${pct(out.til.cl100k, out.js.cl100k)}) |`,
  `| non-blank lines | ${out.til.lines} | ${out.py.lines} | ${out.js.lines} |`, '',
  'Fairness notes: til draws through 7 host builtins (rect/circle/text/pressed/key/width/height) — designing that surface is part of owning the language, and the equivalent surface exists in each baseline (pygame’s API for Python; tiny idiomatic canvas helpers for JS). All three implement the identical spec checklist and are verified (til: games/flappy/verify.mjs, 2000-frame deterministic run; py: headless pygame drive; js: stubbed-DOM frame pump).', '']
fs.writeFileSync(path.join(here, 'tokens.md'), L.join('\n'))
console.log(L.slice(2, 7).join('\n'))
