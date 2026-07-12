// Deterministic verification of flappy.til per SPEC.md's bar:
// drive tick() ≥300 frames with a seeded RNG + autopilot, assert the whole
// state machine: ready → play, pipes spawn, score increments, death, restart.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { parse, check, run } = await import(path.join(here, '..', '..', 'src', 'til.mjs'))

const src = fs.readFileSync(path.join(here, 'flappy.til'), 'utf8')

// deterministic host
let seed = 42
const lcg = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const draws = { rect: 0, circle: 0, text: [], pipeRects: 0 }
let pressedNow = new Set()
const builtins = {
  rect: { arity: 5, fn: (x, y, w, h, c) => { draws.rect++; if (c === '#2dd4bf') draws.pipeRects++ } },
  circle: { arity: 4, fn: () => { draws.circle++ } },
  text: { arity: 4, fn: (x, y, size, s) => draws.text.push(String(s)) },
  pressed: { arity: 1, fn: k => pressedNow.has(k) },
  key: { arity: 1, fn: () => false },
  width: { arity: 0, fn: () => 400 },
  height: { arity: 0, fn: () => 600 },
}

const ast = parse(src, { file: 'flappy.til' })
const { errors } = check(ast, { extraNames: Object.keys(builtins) })
if (errors.length) { console.error('check failed:', errors[0].msg); process.exit(1) }

const { rt } = run(src, { ast, builtins, host: { print: () => {}, read: () => '', write: () => {}, append: () => {}, env: () => null, stdin: () => '', now: () => 0, rand: lcg } })
const tick = parse('tick()').stmts[0].expr
const g = n => rt.globals.get(n)
const frame = press => { pressedNow = press ? new Set(['space']) : new Set(); rt.evalNode(tick, rt.globals) }

const seen = [g('state')]
const note = () => { const s = g('state'); if (s !== seen[seen.length - 1]) seen.push(s) }
const assert = (cond, what) => { if (!cond) { console.error(`✗ ${what}`); process.exit(1) } console.log(`✓ ${what}`) }

// ready phase
for (let i = 0; i < 5; i++) { frame(false); note() }
assert(g('state') === 'ready' && draws.circle > 0, 'ready state renders the bird, no physics')
assert(draws.text.includes('press space'), 'ready overlay text drawn')

// start + autopilot: aim for the nearest pipe gap's center
frame(true); note()
assert(g('state') === 'play', 'flap input starts the game')
let f = 0, maxScore = 0
while (g('state') === 'play' && f < 2000) {
  f++
  const pipes = g('pipes')
  const bird = g('bird')
  const next = pipes.find(p => p.get('x') + 70 > 76)
  const target = next ? next.get('top') + 75 : 300
  frame(bird.get('y') > target && bird.get('vel') > 0)
  note()
  maxScore = Math.max(maxScore, g('score'))
}
assert(maxScore >= 3, `autopilot scored ${maxScore} (≥3): pipes spawn, move, and score`)
assert(draws.pipeRects > 100, 'pipe rects were drawn')

// stop flapping → gravity death
let f2 = 0
while (g('state') === 'play' && f2++ < 400) { frame(false); note() }
assert(g('state') === 'over', 'stopping input kills the bird (ground/pipe collision)')
assert(g('best') === maxScore, `best score persisted (${maxScore})`)
frame(false)
assert(draws.text.some(t => t === 'game over'), 'game-over overlay drawn')

// restart
frame(true); note()
assert(g('state') === 'ready' && g('score') === 0 && g('pipes').length === 0, 'flap on game-over resets to ready')
frame(true); note()
assert(g('state') === 'play', 'plays again after restart')

console.log(`\n✓ flappy.til verified: ${5 + 1 + f + f2 + 3} frames, states ${seen.join(' → ')}, top score ${maxScore}`)
