// til — тіл — a scripting language engineered for AI agents.
// Single file, zero dependencies, runs in Node >= 18 and in the browser.
//
// Design goals (each maps to a measured LLM failure mode — see SPEC.md):
//   1. The whole language teaches in <= ~2k tokens (LLM.md).
//   2. Programs cost fewer tokens than Python/JS for the same task (bench/).
//   3. No imports, no arity surprises, no significant whitespace, no silent coercion.
//   4. Errors are structured data designed to be fed back to a model for one-shot repair.

export const VERSION = '0.1.0'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TilError extends Error {
  constructor(code, msg, extra = {}) {
    super(msg)
    this.til = true
    this.code = code
    Object.assign(this, extra) // line, col, file, src, hint, didYouMean, locals, tilStack
  }
}

function terr(code, msg, at, extra = {}) {
  throw new TilError(code, msg, { line: at?.line, col: at?.col, ...extra })
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

const KEYWORDS = new Set(['fn', 'if', 'else', 'elif', 'match', 'for', 'in', 'while', 'return',
  'ensure', 'eg', 'and', 'or', 'not', 'true', 'false', 'null', 'catch', 'break', 'continue'])

const PUNCT2 = ['==', '!=', '<=', '>=', '->']
const PUNCT1 = '()[]{},:|=<>+-*/%.'

function isIdStart(c) { return /[A-Za-z_]/.test(c) }
function isIdChar(c) { return /[A-Za-z0-9_]/.test(c) }
function isDigit(c) { return c >= '0' && c <= '9' }

// lex(src) -> tokens {t, v, line, col, s, e, sp}
//   t: num str raw id kw punct nl eof
//   sp: preceded by whitespace (disambiguates xs[0] from f [0], f(x) from f (x))
// Newlines inside ( ) and [ ] are suppressed; inside { } they are kept
// (lambda/match bodies use them as separators).
export function lex(src, base = { line: 1, col: 1 }) {
  const toks = []
  let i = 0, line = base.line, col = base.col, sp = false
  const brackets = []
  const push = (t, v, l, c, s, e) => toks.push({ t, v, line: l, col: c, s, e, sp })

  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\r') { i++; col++; sp = true; continue }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '\n') {
      i++; line++; col = 1; sp = true
      const top = brackets[brackets.length - 1]
      if (top === '(' || top === '[') continue
      if (toks.length && toks[toks.length - 1].t !== 'nl') push('nl', '\n', line - 1, col)
      continue
    }
    const l = line, co = col, s = i

    if (isDigit(c)) {
      let j = i
      while (j < src.length && (isDigit(src[j]) || src[j] === '_')) j++
      if (src[j] === '.' && isDigit(src[j + 1])) { j++; while (j < src.length && isDigit(src[j])) j++ }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1
        if (src[k] === '+' || src[k] === '-') k++
        if (isDigit(src[k])) { j = k; while (j < src.length && isDigit(src[j])) j++ }
      }
      const raw = src.slice(i, j)
      push('num', Number(raw.replace(/_/g, '')), l, co, s, j)
      col += j - i; i = j; sp = false; continue
    }

    if (isIdStart(c)) {
      let j = i
      while (j < src.length && isIdChar(src[j])) j++
      const word = src.slice(i, j)
      push(KEYWORDS.has(word) ? 'kw' : 'id', word, l, co, s, j)
      col += j - i; i = j; sp = false; continue
    }

    if (c === '"') {
      const r = lexDq(src, i, line, col)
      toks.push({ t: 'str', v: r.parts, line: l, col: co, s, e: r.i, sp })
      i = r.i; line = r.line; col = r.col; sp = false; continue
    }
    if (c === "'") {
      let j = i + 1, l2 = line
      while (j < src.length && src[j] !== "'") { if (src[j] === '\n') l2++; j++ }
      if (j >= src.length) terr('E_SYNTAX', 'unclosed raw string (started here)', { line: l, col: co })
      push('raw', src.slice(i + 1, j), l, co, s, j + 1)
      const seg = src.slice(i, j + 1); const nl = seg.lastIndexOf('\n')
      line = l2; col = nl >= 0 ? seg.length - nl : col + seg.length
      i = j + 1; sp = false; continue
    }

    const two = src.slice(i, i + 2)
    if (PUNCT2.includes(two)) { push('punct', two, l, co, s, i + 2); i += 2; col += 2; sp = false; continue }
    if (PUNCT1.includes(c)) {
      if (c === '(' || c === '[' || c === '{') brackets.push(c)
      if (c === ')' || c === ']' || c === '}') brackets.pop()
      push('punct', c, l, co, s, i + 1); i++; col++; sp = false; continue
    }
    terr('E_SYNTAX', `unexpected character ${JSON.stringify(c)}`, { line, col },
      { hint: c === ';' ? 'til separates statements with newlines, not semicolons' : undefined })
  }
  push('eof', null, line, col, i, i)
  return toks
}

// Double-quoted string with {expr} interpolation. Returns {parts, i, line, col}.
// parts: [{s: "literal"} | {e: {src, line, col}}]
function lexDq(src, i, line, col) {
  const parts = []
  let buf = '', j = i + 1, l = line, c = col + 1
  const flush = () => { if (buf) { parts.push({ s: buf }); buf = '' } }
  while (true) {
    if (j >= src.length) terr('E_SYNTAX', 'unclosed string', { line, col })
    const ch = src[j]
    if (ch === '"') { flush(); return { parts, i: j + 1, line: l, col: c + 1 } }
    if (ch === '\\') {
      const n = src[j + 1]
      const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", '{': '{', '}': '}' }
      if (!(n in map)) terr('E_SYNTAX', `unknown escape \\${n}`, { line: l, col: c },
        { hint: 'valid escapes: \\n \\t \\r \\\\ \\" \\{ \\}' })
      buf += map[n]; j += 2; c += 2; continue
    }
    if (ch === '{') {
      flush()
      const el = l, ec = c + 1
      let depth = 1, k = j + 1
      while (k < src.length && depth > 0) {
        const d = src[k]
        if (d === '"') { k = skipStr(src, k, '"') }
        else if (d === "'") { k = skipStr(src, k, "'") }
        else { if (d === '{') depth++; if (d === '}') depth--; if (d === '\n') l++; k++ }
      }
      if (depth > 0) terr('E_SYNTAX', 'unclosed { in string interpolation', { line: el, col: ec })
      const inner = src.slice(j + 1, k - 1)
      if (!inner.trim()) terr('E_SYNTAX', 'empty {} in string', { line: el, col: ec },
        { hint: 'write a value inside {…}, or escape as \\{\\}' })
      parts.push({ e: { src: inner, line: el, col: ec } })
      const nl = inner.lastIndexOf('\n'); c = nl >= 0 ? inner.length - nl + 1 : c + inner.length + 2
      j = k; continue
    }
    if (ch === '\n') { buf += ch; l++; c = 1; j++; continue }
    buf += ch; j++; c++
  }
}
function skipStr(src, k, q) { // k at opening quote; returns index after closing quote
  k++
  while (k < src.length && src[k] !== q) { if (q === '"' && src[k] === '\\') k++; k++ }
  return k + 1
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const CMP_OPS = new Set(['==', '!=', '<', '<=', '>', '>='])

class Parser {
  constructor(toks, ctx) { this.toks = toks; this.i = 0; this.ctx = ctx; this.noBrace = 0 }
  // parse a control-flow header expression: `{` there opens the block, not a lambda
  header() { this.noBrace++; try { return this.expr() } finally { this.noBrace-- } }
  // parse inside explicit brackets: `{` is an expression again
  grouped(f) { const saved = this.noBrace; this.noBrace = 0; try { return f() } finally { this.noBrace = saved } }
  peek(k = 0) { return this.toks[Math.min(this.i + k, this.toks.length - 1)] }
  at(t, v) { const p = this.peek(); return p.t === t && (v === undefined || p.v === v) }
  eat() { return this.toks[this.i++] }
  expect(t, v, what) {
    if (this.at(t, v)) return this.eat()
    const p = this.peek()
    let hint
    if (v === ')' && p.v === ',') hint = 'til calls look like `f x y` — no commas. For grouping use (…); lists use [a, b].'
    terr('E_SYNTAX', `expected ${what || v || t}, got ${tokDesc(p)}`, p, { hint })
  }
  skipNl() { while (this.at('nl')) this.i++ }
  // if the next non-newline token is `v`, consume newlines and return true
  contAfterNl(t, v) {
    let j = this.i
    while (this.toks[j].t === 'nl') j++
    if (this.toks[j].t === t && this.toks[j].v === v) { this.i = j; return true }
    return false
  }
  sep(where) {
    if (this.at('nl')) { this.eat(); this.skipNl(); return }
    if (this.at('eof') || this.at('punct', '}')) return
    const p = this.peek()
    let hint
    if (p.v === '=') hint = 'til has no compound assignment (+=, -=); write x = x + 1'
    if (CMP_OPS.has(p.v)) hint = 'chained comparisons are not supported; use `a < b and b < c`'
    if (p.t === 'str' || p.t === 'num' || p.t === 'raw') hint = 'missing newline or comma? statements are newline-separated; list items are comma-separated'
    terr('E_SYNTAX', `unexpected ${tokDesc(p)} after ${where || 'statement'}`, p, { hint })
  }

  program() {
    this.skipNl()
    const stmts = []
    while (!this.at('eof')) { stmts.push(this.stmt()); this.sep() }
    return { k: 'Program', stmts }
  }

  stmt() {
    const p = this.peek()
    if (p.t === 'kw') {
      switch (p.v) {
        case 'fn': return this.fnDef()
        case 'return': { this.eat(); const e = (this.at('nl') || this.at('eof') || this.at('punct', '}')) ? null : this.expr(); return { k: 'Return', expr: e, line: p.line, col: p.col } }
        case 'ensure': { this.eat(); const e = this.expr(); return { k: 'Ensure', expr: e, line: p.line, col: p.col, src: this.slice(e) } }
        case 'eg': { this.eat(); const e = this.expr(); return { k: 'Eg', expr: e, line: p.line, col: p.col, src: this.slice(e) } }
        case 'for': {
          this.eat()
          const name = this.expect('id', undefined, 'loop variable').v
          this.expect('kw', 'in')
          const it = this.header()
          return { k: 'For', name, iter: it, body: this.block(), line: p.line, col: p.col }
        }
        case 'while': { this.eat(); const c = this.header(); return { k: 'While', cond: c, body: this.block(), line: p.line, col: p.col } }
        case 'break': this.eat(); return { k: 'Break', line: p.line, col: p.col }
        case 'continue': this.eat(); return { k: 'Continue', line: p.line, col: p.col }
      }
    }
    const e = this.expr()
    if (this.at('punct', ',')) {
      // multi-assignment: a, b = b, a + b (right side evaluates fully first)
      const targets = [e]
      while (this.at('punct', ',')) { this.eat(); this.skipNl(); targets.push(this.expr()) }
      const eq = this.expect('punct', '=', '= after assignment targets')
      for (const t of targets) if (!['Name', 'Index', 'Dot'].includes(t.k))
        terr('E_SYNTAX', 'invalid assignment target', eq, { hint: 'assign to names, m.key, or xs[i]' })
      this.skipNl()
      const exprs = [this.expr()]
      while (this.at('punct', ',')) { this.eat(); this.skipNl(); exprs.push(this.expr()) }
      if (exprs.length !== targets.length)
        terr('E_SYNTAX', `${targets.length} targets but ${exprs.length} values`, eq)
      return { k: 'MultiAssign', targets, exprs, line: e.line, col: e.col }
    }
    if (this.at('punct', '=')) {
      const eq = this.eat()
      if (!['Name', 'Index', 'Dot'].includes(e.k))
        terr('E_SYNTAX', 'invalid assignment target', eq, { hint: 'assign to a name, m.key, or xs[i]' })
      this.skipNl()
      return { k: 'Assign', target: e, expr: this.expr(), line: e.line, col: e.col }
    }
    return { k: 'ExprStmt', expr: e, line: e.line, col: e.col }
  }

  fnDef() {
    const kw = this.eat()
    const name = this.expect('id', undefined, 'function name').v
    const params = []
    while (this.at('id')) params.push(this.eat().v)
    let body, exprBody = false
    if (this.at('punct', '=')) { this.eat(); this.skipNl(); body = this.expr(); exprBody = true }
    else body = this.block()
    return { k: 'Fn', name, params, body, exprBody, line: kw.line, col: kw.col, s: kw.s, e: this.toks[this.i - 1].e }
  }

  block() {
    const open = this.expect('punct', '{', '{ to open a block')
    this.skipNl()
    const stmts = []
    while (!this.at('punct', '}')) {
      if (this.at('eof')) terr('E_SYNTAX', 'unclosed block (missing })', open)
      stmts.push(this.stmt()); this.sep('statement in block')
    }
    this.eat()
    return { k: 'Block', stmts, line: open.line, col: open.col }
  }

  slice(node) {
    // best-effort source slice for describe/errors
    const s = this.ctx?.src
    if (!s || node.s === undefined) return ''
    return s.slice(node.s, node.e).trim()
  }

  // -- expressions ----------------------------------------------------------

  expr() { return this.pipeE() }

  pipeE() {
    let l = this.catchE()
    while (this.at('punct', '|') || this.contAfterNl('punct', '|')) {
      const op = this.eat(); this.skipNl()
      const r = this.catchE()
      l = { k: 'Call', callee: r, arg: l, line: op.line, col: op.col, pipe: true, s: l.s, e: r.e }
    }
    return l
  }

  catchE() {
    let l = this.orE()
    while (this.at('kw', 'catch') || this.contAfterNl('kw', 'catch')) {
      const op = this.eat(); this.skipNl()
      const r = this.orE()
      l = { k: 'Catch', l, r, line: op.line, col: op.col, s: l.s, e: r.e }
    }
    return l
  }

  orE() {
    let l = this.andE()
    while (this.at('kw', 'or')) { const op = this.eat(); this.skipNl(); const r = this.andE(); l = { k: 'Logic', op: 'or', l, r, line: op.line, col: op.col, s: l.s, e: r.e } }
    return l
  }
  andE() {
    let l = this.notE()
    while (this.at('kw', 'and')) { const op = this.eat(); this.skipNl(); const r = this.notE(); l = { k: 'Logic', op: 'and', l, r, line: op.line, col: op.col, s: l.s, e: r.e } }
    return l
  }
  notE() {
    if (this.at('kw', 'not')) { const op = this.eat(); const x = this.notE(); return { k: 'Un', op: 'not', expr: x, line: op.line, col: op.col, s: op.s, e: x.e } }
    return this.cmpE()
  }
  cmpE() {
    const l = this.addE()
    const p = this.peek()
    if (p.t === 'punct' && CMP_OPS.has(p.v)) {
      this.eat(); this.skipNl()
      return { k: 'Bin', op: p.v, l, r: this.addE(), line: p.line, col: p.col, s: l.s, e: this.toks[this.i - 1].e }
    }
    if (p.t === 'kw' && p.v === 'in') {
      this.eat(); this.skipNl()
      const r = this.addE()
      return { k: 'Bin', op: 'in', l, r, line: p.line, col: p.col, s: l.s, e: r.e }
    }
    return l
  }
  addE() {
    let l = this.mulE()
    while (this.at('punct', '+') || this.at('punct', '-')) {
      const op = this.eat(); this.skipNl()
      l = { k: 'Bin', op: op.v, l, r: this.mulE(), line: op.line, col: op.col, s: l.s, e: this.toks[this.i - 1].e }
    }
    return l
  }
  mulE() {
    let l = this.unE()
    while (this.at('punct', '*') || this.at('punct', '/') || this.at('punct', '%')) {
      const op = this.eat(); this.skipNl()
      l = { k: 'Bin', op: op.v, l, r: this.unE(), line: op.line, col: op.col }
    }
    return l
  }
  unE() {
    if (this.at('punct', '-')) { const op = this.eat(); return { k: 'Un', op: '-', expr: this.unE(), line: op.line, col: op.col } }
    return this.callE()
  }

  callE() {
    let f = this.postfix()
    while (true) {
      // negative literal argument, Ruby-style: `abs -3` = abs (-3) when `-` has
      // a space before but not after; `a - b` / `a-b` stay subtraction
      const p = this.peek()
      if (p.t === 'punct' && p.v === '-' && p.sp && this.peek(1).t === 'num' && !this.peek(1).sp) {
        this.eat(); const n = this.eat()
        f = { k: 'Call', callee: f, arg: { k: 'Num', v: -n.v, line: n.line, col: n.col, s: p.s, e: n.e }, line: f.line, col: f.col, s: f.s, e: n.e }
        continue
      }
      if (!this.atomStart()) break
      const a = this.postfix()
      f = { k: 'Call', callee: f, arg: a, line: f.line, col: f.col, s: f.s, e: a.e }
    }
    return f
  }

  atomStart() {
    const p = this.peek()
    if (p.t === 'num' || p.t === 'str' || p.t === 'raw' || p.t === 'id') return true
    if (p.t === 'kw') return ['true', 'false', 'null', 'if', 'match'].includes(p.v)
    if (p.t === 'punct') {
      if (p.v === '{') return this.noBrace === 0
      return p.v === '(' || p.v === '['
    }
    return false
  }

  postfix() {
    let e = this.atom()
    while (true) {
      const p = this.peek()
      if (p.t === 'punct' && p.v === '.') {
        this.eat()
        const n = this.expect('id', undefined, 'field name after .')
        e = { k: 'Dot', obj: e, name: n.v, line: p.line, col: p.col, s: e.s, e: n.e }
        continue
      }
      if (p.t === 'punct' && p.v === '[' && !p.sp) {
        this.eat()
        const idx = this.grouped(() => this.expr())
        const close = this.expect('punct', ']')
        e = { k: 'Index', obj: e, idx, line: p.line, col: p.col, s: e.s, e: close.e }
        continue
      }
      if (p.t === 'punct' && p.v === '(' && !p.sp) {
        this.eat()
        if (this.at('punct', ')')) { const close = this.eat(); e = { k: 'Call0', callee: e, line: p.line, col: p.col, s: e.s, e: close.e }; continue }
        // tolerated call syntax: f(a, b) — canonical is `f a b`
        const args = [this.grouped(() => this.expr())]
        while (this.at('punct', ',')) { this.eat(); this.skipNl(); args.push(this.grouped(() => this.expr())) }
        const close = this.expect('punct', ')')
        for (const a of args) e = { k: 'Call', callee: e, arg: a, line: p.line, col: p.col, s: e.s, e: close.e }
        continue
      }
      break
    }
    return e
  }

  atom() {
    const p = this.peek()
    if (p.t === 'num') { this.eat(); return { k: 'Num', v: p.v, line: p.line, col: p.col, s: p.s, e: p.e } }
    if (p.t === 'raw') { this.eat(); return { k: 'Str', parts: [{ s: p.v }], line: p.line, col: p.col, s: p.s, e: p.e } }
    if (p.t === 'str') {
      this.eat()
      const parts = p.v.map(part => part.e
        ? { e: parseSub(part.e, this.ctx) }
        : part)
      return { k: 'Str', parts, line: p.line, col: p.col, s: p.s, e: p.e }
    }
    if (p.t === 'id') { this.eat(); return { k: 'Name', name: p.v, line: p.line, col: p.col, s: p.s, e: p.e } }
    if (p.t === 'kw') {
      if (p.v === 'true' || p.v === 'false') { this.eat(); return { k: 'Bool', v: p.v === 'true', line: p.line, col: p.col, s: p.s, e: p.e } }
      if (p.v === 'null') { this.eat(); return { k: 'Null', line: p.line, col: p.col, s: p.s, e: p.e } }
      if (p.v === 'if') return this.ifE()
      if (p.v === 'match') return this.matchE()
      terr('E_SYNTAX', `unexpected keyword \`${p.v}\``, p)
    }
    if (p.t === 'punct') {
      if (p.v === '(') {
        this.eat(); this.skipNl()
        const e = this.grouped(() => this.expr())
        if (this.at('punct', ',')) terr('E_SYNTAX', 'unexpected , inside (…)', this.peek(),
          { hint: 'calls are `f x y` (or f(a, b) attached to a name); lists are [a, b]' })
        const close = this.expect('punct', ')')
        return { ...e, s: p.s, e: close.e }
      }
      if (p.v === '[') return this.listE()
      if (p.v === '{') return this.braceE()
    }
    terr('E_SYNTAX', `unexpected ${tokDesc(p)}`, p)
  }

  listE() {
    const open = this.eat()
    const els = []
    if (!this.at('punct', ']')) {
      els.push(this.grouped(() => this.expr()))
      while (this.at('punct', ',')) { this.eat(); if (this.at('punct', ']')) break; els.push(this.grouped(() => this.expr())) }
    }
    const close = this.expect('punct', ']')
    return { k: 'List', els, line: open.line, col: open.col, s: open.s, e: close.e }
  }

  // `{` in expression position: {} map | {k: v} map | {x -> …} lambda | {…} lambda with implicit `it`
  braceE() {
    const open = this.eat()
    this.skipNl()
    if (this.at('punct', '}')) { const close = this.eat(); return { k: 'MapLit', entries: [], line: open.line, col: open.col, s: open.s, e: close.e } }
    // map lookahead: (id|str|raw) ':'
    if ((this.at('id') || this.at('str') || this.at('raw')) && this.peek(1).t === 'punct' && this.peek(1).v === ':')
      return this.mapRest(open)
    // params lambda lookahead: id* '->'
    let j = 0
    while (this.peek(j).t === 'id') j++
    if (this.peek(j).t === 'punct' && this.peek(j).v === '->') {
      const params = []
      for (let k = 0; k < j; k++) params.push(this.eat().v)
      this.eat() // ->
      this.skipNl()
      const body = this.lambdaBody(open)
      return { k: 'Lam', params, body, line: open.line, col: open.col, s: open.s, e: this.toks[this.i - 1].e }
    }
    // implicit-it lambda
    const body = this.lambdaBody(open)
    return { k: 'Lam', params: ['it'], body, implicit: true, line: open.line, col: open.col, s: open.s, e: this.toks[this.i - 1].e }
  }

  lambdaBody(open) {
    const stmts = []
    this.skipNl()
    while (!this.at('punct', '}')) {
      if (this.at('eof')) terr('E_SYNTAX', 'unclosed { … } (lambda or map)', open)
      stmts.push(this.stmt()); this.sep('statement in { … }')
    }
    this.eat()
    return { k: 'Block', stmts, line: open.line, col: open.col }
  }

  mapRest(open) {
    const entries = []
    while (true) {
      this.skipNl()
      if (this.at('punct', '}')) break
      let key
      if (this.at('id')) key = { lit: this.eat().v }
      else if (this.at('str')) { const t = this.eat(); key = { node: { k: 'Str', parts: t.v.map(pp => pp.e ? { e: parseSub(pp.e, this.ctx) } : pp), line: t.line, col: t.col } } }
      else if (this.at('raw')) key = { lit: this.eat().v }
      else terr('E_SYNTAX', `expected map key, got ${tokDesc(this.peek())}`, this.peek())
      this.expect('punct', ':')
      this.skipNl()
      entries.push({ key, val: this.grouped(() => this.expr()) })
      this.skipNl()
      if (this.at('punct', ',')) { this.eat(); continue }
      if (this.at('punct', '}')) break
      terr('E_SYNTAX', `expected , or } in map, got ${tokDesc(this.peek())}`, this.peek())
    }
    const close = this.expect('punct', '}')
    return { k: 'MapLit', entries, line: open.line, col: open.col, s: open.s, e: close.e }
  }

  ifE() {
    const kw = this.eat()
    const cond = this.header()
    const then = this.block()
    let els = null
    if (this.at('kw', 'elif') || this.contAfterNl('kw', 'elif')) {
      els = this.ifE() // elif parses like a nested if
    } else if (this.at('kw', 'else') || this.contAfterNl('kw', 'else')) {
      this.eat()
      els = this.at('kw', 'if') ? this.ifE() : this.block()
    }
    return { k: 'If', cond, then, els, line: kw.line, col: kw.col, s: kw.s, e: this.toks[this.i - 1].e }
  }

  matchE() {
    const kw = this.eat()
    const subject = this.header()
    this.expect('punct', '{', '{ to open match cases')
    this.skipNl()
    const cases = []
    while (!this.at('punct', '}')) {
      if (this.at('eof')) terr('E_SYNTAX', 'unclosed match block', kw)
      const pat = this.pattern()
      let guard = null
      if (this.at('kw', 'if')) { this.eat(); guard = this.expr() }
      this.expect('punct', '->')
      this.skipNl()
      let body
      if (this.at('punct', '{')) {
        // block body, unless it lexes as a map literal
        const p1 = this.peek(1), p2 = this.peek(2)
        const isMap = (p1.t === 'punct' && p1.v === '}') ||
          ((p1.t === 'id' || p1.t === 'str' || p1.t === 'raw') && p2.t === 'punct' && p2.v === ':')
        body = isMap ? this.expr() : this.block()
      } else body = this.expr()
      cases.push({ pat, guard, body })
      this.sep('match case')
    }
    this.eat()
    return { k: 'Match', subject, cases, line: kw.line, col: kw.col }
  }

  pattern() {
    const p = this.peek()
    if (p.t === 'num') { this.eat(); return { k: 'lit', v: p.v } }
    if (p.t === 'punct' && p.v === '-' && this.peek(1).t === 'num') { this.eat(); const n = this.eat(); return { k: 'lit', v: -n.v } }
    if (p.t === 'raw') { this.eat(); return { k: 'lit', v: p.v } }
    if (p.t === 'str') {
      this.eat()
      if (p.v.some(x => x.e)) terr('E_SYNTAX', 'match patterns must be plain strings (no {interpolation})', p)
      return { k: 'lit', v: p.v.map(x => x.s).join('') }
    }
    if (p.t === 'kw' && (p.v === 'true' || p.v === 'false')) { this.eat(); return { k: 'lit', v: p.v === 'true' } }
    if (p.t === 'kw' && p.v === 'null') { this.eat(); return { k: 'lit', v: null } }
    if (p.t === 'id') { this.eat(); return p.v === '_' ? { k: 'any' } : { k: 'bind', name: p.v } }
    terr('E_SYNTAX', `expected a pattern (literal, name, or _), got ${tokDesc(p)}`, p)
  }
}

function parseSub(part, ctx) {
  const toks = lex(part.src, { line: part.line, col: part.col })
  const p = new Parser(toks, ctx)
  p.skipNl()
  const e = p.expr()
  p.skipNl()
  if (!p.at('eof')) terr('E_SYNTAX', `unexpected ${tokDesc(p.peek())} in string interpolation`, p.peek())
  return e
}

function tokDesc(p) {
  if (p.t === 'eof') return 'end of file'
  if (p.t === 'nl') return 'end of line'
  if (p.t === 'str') return 'string'
  if (p.t === 'num') return `number ${p.v}`
  if (p.t === 'id' || p.t === 'kw') return `\`${p.v}\``
  return `\`${p.v}\``
}

export function parse(src, ctx = {}) {
  const toks = lex(src)
  return new Parser(toks, { ...ctx, src }).program()
}

// ---------------------------------------------------------------------------
// Static checker: unknown names (with did-you-mean), arity, misc
// ---------------------------------------------------------------------------

function levenshtein(a, b) { // Damerau: transpositions (maen → mean) cost 1
  if (Math.abs(a.length - b.length) > 2) return 99
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
      d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[m][n]
}

function suggest(name, candidates) {
  const scored = []
  for (const c of candidates) {
    const dist = levenshtein(name.toLowerCase(), c.toLowerCase())
    if (dist <= 2 || (name.length >= 3 && c.toLowerCase().startsWith(name.toLowerCase())))
      scored.push([dist, c])
  }
  scored.sort((a, b) => a[0] - b[0])
  return [...new Set(scored.map(x => x[1]))].slice(0, 2)
}

// collect names assigned anywhere in a function body (not descending into nested fns/lambdas)
function collectAssigned(node, out) {
  if (!node || typeof node !== 'object') return
  if (node.k === 'Fn' || node.k === 'Lam') return
  if (node.k === 'Assign' && node.target.k === 'Name') out.add(node.target.name)
  if (node.k === 'MultiAssign') for (const t of node.targets) if (t.k === 'Name') out.add(t.name)
  if (node.k === 'For') out.add(node.name)
  for (const key of Object.keys(node)) {
    if (key === 'k') continue
    const v = node[key]
    if (Array.isArray(v)) v.forEach(x => collectAssigned(x, out))
    else if (v && typeof v === 'object') collectAssigned(v, out)
  }
}

export function check(ast, opts = {}) {
  const errors = [], warnings = []
  const builtinNames = new Set(Object.keys(BUILTIN_SPECS))

  function fnNames(stmts) {
    const s = new Set()
    for (const st of stmts) if (st.k === 'Fn') s.add(st.name)
    return s
  }

  function walkBody(stmts, scope, inFn, inLoop) {
    const local = new Set([...fnNames(stmts)])
    const assigned = new Set()
    for (const st of stmts) collectAssigned(st, assigned)
    for (const a of assigned) local.add(a)
    const sc = { names: local, parent: scope }
    for (const st of stmts) walkStmt(st, sc, inFn, inLoop)
  }

  function visible(scope) {
    const all = new Set(builtinNames)
    for (let s = scope; s; s = s.parent) for (const n of s.names) all.add(n)
    return all
  }
  function has(scope, n) {
    if (builtinNames.has(n)) return true
    for (let s = scope; s; s = s.parent) if (s.names.has(n)) return true
    return false
  }

  function walkStmt(st, scope, inFn, inLoop) {
    switch (st.k) {
      case 'Fn': {
        if (builtinNames.has(st.name))
          warnings.push({ code: 'W_SHADOW', msg: `fn \`${st.name}\` shadows a builtin`, line: st.line, col: st.col })
        const sc = { names: new Set(st.params), parent: scope }
        if (st.exprBody) walkExpr(st.body, sc, true, false)
        else walkBody(st.body.stmts, sc, true, false)
        return
      }
      case 'Assign':
        if (st.target.k === 'Name' && builtinNames.has(st.target.name))
          warnings.push({ code: 'W_SHADOW', msg: `assignment to \`${st.target.name}\` shadows a builtin — later calls like \`${st.target.name} xs\` will use your value`, line: st.line, col: st.col })
        if (st.target.k !== 'Name') walkExpr(st.target, scope, inFn, inLoop)
        walkExpr(st.expr, scope, inFn, inLoop); return
      case 'MultiAssign':
        for (const t of st.targets) {
          if (t.k === 'Name' && builtinNames.has(t.name))
            warnings.push({ code: 'W_SHADOW', msg: `assignment to \`${t.name}\` shadows a builtin`, line: st.line, col: st.col })
          if (t.k !== 'Name') walkExpr(t, scope, inFn, inLoop)
        }
        for (const x of st.exprs) walkExpr(x, scope, inFn, inLoop)
        return
      case 'ExprStmt': case 'Ensure': case 'Eg':
        if (st.k === 'Eg' && inFn) warnings.push({ code: 'W_EG', msg: 'eg inside a function never runs as a test; move it to top level', line: st.line, col: st.col })
        walkExpr(st.expr, scope, inFn, inLoop); return
      case 'Return':
        if (!inFn) errors.push({ code: 'E_RETURN', msg: 'return outside a function', line: st.line, col: st.col })
        if (st.expr) walkExpr(st.expr, scope, inFn, inLoop); return
      case 'For': walkExpr(st.iter, scope, inFn, inLoop); walkBody2(st.body, scope, inFn, true); return
      case 'While': walkExpr(st.cond, scope, inFn, inLoop); walkBody2(st.body, scope, inFn, true); return
      case 'Break': case 'Continue':
        if (!inLoop) errors.push({ code: 'E_LOOP', msg: `${st.k.toLowerCase()} outside a loop`, line: st.line, col: st.col })
        return
    }
  }
  // blocks share the enclosing scope (names were pre-collected)
  function walkBody2(block, scope, inFn, inLoop) { for (const st of block.stmts) walkStmt(st, scope, inFn, inLoop) }

  function walkExpr(e, scope, inFn, inLoop) {
    if (!e) return
    switch (e.k) {
      case 'Name': {
        if (!has(scope, e.name)) {
          const dym = suggest(e.name, [...visible(scope)])
          errors.push({
            code: 'E_NAME', msg: `unknown name \`${e.name}\``, line: e.line, col: e.col,
            didYouMean: dym.length ? dym : undefined,
            hint: 'all builtins are always in scope — til has no imports'
          })
        }
        return
      }
      case 'Call': {
        // arity warning on saturated builtin call spines: `map f xs ys`
        let spine = e, depth = 0
        while (spine.k === 'Call') { depth++; spine = spine.callee }
        if (spine.k === 'Name' && BUILTIN_SPECS[spine.name] && !scopeShadows(scope, spine.name)) {
          const ar = BUILTIN_SPECS[spine.name].arity
          if (depth > ar && ar > 0)
            warnings.push({ code: 'W_ARITY', msg: `\`${spine.name}\` takes ${ar} arg${ar === 1 ? '' : 's'} but this call chain passes ${depth}`, line: e.line, col: e.col, hint: 'extra args are applied to the result; if unintended, add parens' })
        }
        walkExpr(e.callee, scope, inFn, inLoop); walkExpr(e.arg, scope, inFn, inLoop); return
      }
      case 'Call0': walkExpr(e.callee, scope, inFn, inLoop); return
      case 'Lam': {
        const sc = { names: new Set(e.params), parent: scope }
        walkBody(e.body.stmts, sc, true, false); return
      }
      case 'If': walkExpr(e.cond, scope, inFn, inLoop); walkBody2(e.then, scope, inFn, inLoop); if (e.els) (e.els.k === 'Block' ? walkBody2(e.els, scope, inFn, inLoop) : walkExpr(e.els, scope, inFn, inLoop)); return
      case 'Match': {
        walkExpr(e.subject, scope, inFn, inLoop)
        for (const c of e.cases) {
          const sc = c.pat.k === 'bind' ? { names: new Set([c.pat.name]), parent: scope } : scope
          if (c.guard) walkExpr(c.guard, sc, inFn, inLoop)
          if (c.body.k === 'Block') walkBody(c.body.stmts, sc, inFn, inLoop)
          else walkExpr(c.body, sc, inFn, inLoop)
        }
        return
      }
      case 'Str': for (const part of e.parts) if (part.e) walkExpr(part.e, scope, inFn, inLoop); return
      case 'List': e.els.forEach(x => walkExpr(x, scope, inFn, inLoop)); return
      case 'MapLit': e.entries.forEach(en => { if (en.key.node) walkExpr(en.key.node, scope, inFn, inLoop); walkExpr(en.val, scope, inFn, inLoop) }); return
      case 'Bin': case 'Logic': walkExpr(e.l, scope, inFn, inLoop); walkExpr(e.r, scope, inFn, inLoop); return
      case 'Catch': walkExpr(e.l, scope, inFn, inLoop); walkExpr(e.r, scope, inFn, inLoop); return
      case 'Un': walkExpr(e.expr, scope, inFn, inLoop); return
      case 'Index': walkExpr(e.obj, scope, inFn, inLoop); walkExpr(e.idx, scope, inFn, inLoop); return
      case 'Dot': walkExpr(e.obj, scope, inFn, inLoop); return
    }
  }
  function scopeShadows(scope, n) { for (let s = scope; s; s = s.parent) if (s.names.has(n)) return true; return false }

  walkBody(ast.stmts, null, false, false)
  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Runtime values
// ---------------------------------------------------------------------------

const MISSING = Symbol('missing')
class BreakSig { }
class ContinueSig { }
class ReturnSig { constructor(v) { this.v = v } }

class Env {
  constructor(parent) { this.m = new Map(); this.parent = parent }
  get(n) { let e = this; while (e) { if (e.m.has(n)) return e.m.get(n); e = e.parent } return MISSING }
  define(n, v) { this.m.set(n, v) }
  set(n, v) {
    let e = this
    while (e) { if (e.m.has(n)) { e.m.set(n, v); return } e = e.parent }
    this.m.set(n, v)
  }
}

export function typeOf(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return 'num'
  if (typeof v === 'string') return 'str'
  if (typeof v === 'boolean') return 'bool'
  if (Array.isArray(v)) return 'list'
  if (v instanceof Map) return 'map'
  if (v && (v.kind === 'fn' || v.kind === 'builtin' || v.kind === 'partial')) return 'fn'
  return 'unknown'
}

export function truthy(v) {
  if (v === null || v === undefined || v === false) return false
  if (v === 0 || v === '' || (typeof v === 'number' && Number.isNaN(v))) return false
  if (Array.isArray(v)) return v.length > 0
  if (v instanceof Map) return v.size > 0
  return true
}

export function deepEq(a, b) {
  if (a === b) return true
  const ta = typeOf(a), tb = typeOf(b)
  if (ta !== tb) return false
  if (ta === 'num') return a === b
  if (ta === 'list') return a.length === b.length && a.every((x, i) => deepEq(x, b[i]))
  if (ta === 'map') {
    if (a.size !== b.size) return false
    for (const [k, v] of a) { if (!b.has(k) || !deepEq(v, b.get(k))) return false }
    return true
  }
  return false
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
export function display(v, nested = false) {
  const t = typeOf(v)
  if (t === 'null') return 'null'
  if (t === 'num') return Object.is(v, -0) ? '0' : String(v)
  if (t === 'bool') return String(v)
  if (t === 'str') return nested ? JSON.stringify(v) : v
  if (t === 'list') return '[' + v.map(x => display(x, true)).join(', ') + ']'
  if (t === 'map') {
    const parts = []
    for (const [k, val] of v) parts.push(`${IDENT_RE.test(k) ? k : JSON.stringify(k)}: ${display(val, true)}`)
    return '{' + parts.join(', ') + '}'
  }
  if (t === 'fn') {
    const target = v.kind === 'partial' ? v.target : v
    const got = v.kind === 'partial' ? v.args.length : 0
    return `<fn ${target.name || 'anonymous'}/${arityOf(target) - got}>`
  }
  return String(v)
}

function arityOf(f) { return f.kind === 'builtin' ? f.arity : f.params.length }

// ---------------------------------------------------------------------------
// Builtins — the entire standard library. Always in scope. Data-last, curried.
// ---------------------------------------------------------------------------

// spec: { arity, sig, doc } — implementations built per-runtime in makeBuiltins
export const BUILTIN_SPECS = {
  // io / system
  print: { arity: 1, sig: 'print x', doc: 'write x and a newline; returns x (usable mid-pipe)' },
  read: { arity: 1, sig: 'read path', doc: 'file contents as str (error if missing — catchable)' },
  write: { arity: 2, sig: 'write path s', doc: 'write file; returns null' },
  append: { arity: 2, sig: 'append path s', doc: 'append to file' },
  env: { arity: 1, sig: 'env name', doc: 'environment variable or null' },
  args: { arity: 0, sig: 'args()', doc: 'CLI args as list of str' },
  stdin: { arity: 0, sig: 'stdin()', doc: 'all of standard input as str' },
  now: { arity: 0, sig: 'now()', doc: 'unix time in milliseconds' },
  rand: { arity: 0, sig: 'rand()', doc: 'random float in [0, 1)' },
  // strings
  lines: { arity: 1, sig: 'lines s', doc: 'split on newlines (trailing empty line dropped)' },
  words: { arity: 1, sig: 'words s', doc: 'split on any whitespace, no empties' },
  chars: { arity: 1, sig: 'chars s', doc: 'list of 1-char strings' },
  trim: { arity: 1, sig: 'trim s', doc: 'strip surrounding whitespace' },
  upper: { arity: 1, sig: 'upper s', doc: '' },
  lower: { arity: 1, sig: 'lower s', doc: '' },
  split: { arity: 2, sig: 'split sep s', doc: '' },
  join: { arity: 2, sig: 'join sep xs', doc: '' },
  replace: { arity: 3, sig: 'replace old new s', doc: 'replace ALL occurrences' },
  starts: { arity: 2, sig: 'starts prefix s', doc: '' },
  ends: { arity: 2, sig: 'ends suffix s', doc: '' },
  rep: { arity: 2, sig: 'rep n x', doc: 'repeat str n times, or list of n copies' },
  num: { arity: 1, sig: 'num s', doc: 'parse number (error if not numeric — catchable)' },
  str: { arity: 1, sig: 'str x', doc: 'display form of any value' },
  // lists
  len: { arity: 1, sig: 'len x', doc: 'length of str/list/map' },
  range: { arity: 2, sig: 'range a b', doc: '[a … b-1]' },
  map: { arity: 2, sig: 'map f xs', doc: '' },
  keep: { arity: 2, sig: 'keep f xs', doc: 'filter: elements where f x is truthy' },
  each: { arity: 2, sig: 'each f xs', doc: 'run f for side effects; returns null' },
  fold: { arity: 3, sig: 'fold f init xs', doc: 'f acc x → new acc' },
  sum: { arity: 1, sig: 'sum xs', doc: '' },
  min: { arity: 1, sig: 'min xs', doc: 'smallest (error on empty)' },
  max: { arity: 1, sig: 'max xs', doc: '' },
  mean: { arity: 1, sig: 'mean xs', doc: 'average (error on empty)' },
  median: { arity: 1, sig: 'median xs', doc: 'middle value; even length averages the two middles' },
  stdev: { arity: 1, sig: 'stdev xs', doc: 'population standard deviation' },
  sort: { arity: 1, sig: 'sort xs', doc: 'ascending; all nums or all strs' },
  sortBy: { arity: 2, sig: 'sortBy f xs', doc: 'sort by key f x (use -key for desc)' },
  rev: { arity: 1, sig: 'rev x', doc: 'reverse list or str' },
  uniq: { arity: 1, sig: 'uniq xs', doc: 'dedupe, keeps first, preserves order' },
  group: { arity: 2, sig: 'group f xs', doc: 'map of str(f x) → list of x' },
  counts: { arity: 1, sig: 'counts xs', doc: 'map of value → occurrences' },
  top: { arity: 2, sig: 'top n m', doc: 'n highest {k, v} items of a map, by v descending' },
  zip: { arity: 2, sig: 'zip xs ys', doc: 'list of [x, y] pairs (shorter length)' },
  flat: { arity: 1, sig: 'flat xs', doc: 'flatten one level' },
  first: { arity: 1, sig: 'first xs', doc: 'first element or null' },
  last: { arity: 1, sig: 'last xs', doc: '' },
  take: { arity: 2, sig: 'take n x', doc: 'first n of list/str' },
  skip: { arity: 2, sig: 'skip n x', doc: 'all but first n' },
  push: { arity: 2, sig: 'push x xs', doc: 'append x to xs IN PLACE; returns xs' },
  pop: { arity: 1, sig: 'pop xs', doc: 'remove and return last element (null if empty); mutates' },
  has: { arity: 2, sig: 'has x coll', doc: 'elem in list / substr in str / key in map' },
  find: { arity: 2, sig: 'find f xs', doc: 'first element where f x truthy, else null' },
  pos: { arity: 2, sig: 'pos x xs', doc: 'index of x in list/str, else null' },
  any: { arity: 2, sig: 'any f xs', doc: '' },
  all: { arity: 2, sig: 'all f xs', doc: '' },
  // maps
  keys: { arity: 1, sig: 'keys m', doc: '' },
  vals: { arity: 1, sig: 'vals m', doc: '' },
  get: { arity: 2, sig: 'get k x', doc: 'safe lookup: map key or list index, null if absent' },
  put: { arity: 3, sig: 'put k v m', doc: 'NEW map with k set (m[k] = v mutates instead)' },
  del: { arity: 2, sig: 'del k m', doc: 'new map without k' },
  merge: { arity: 2, sig: 'merge a b', doc: 'new map, b wins' },
  items: { arity: 1, sig: 'items m', doc: 'list of {k, v} maps' },
  toMap: { arity: 1, sig: 'toMap pairs', doc: 'inverse of items' },
  // json
  json: { arity: 1, sig: 'json s', doc: 'parse JSON (catchable)' },
  tojson: { arity: 1, sig: 'tojson x', doc: 'compact JSON string' },
  pretty: { arity: 1, sig: 'pretty x', doc: '2-space indented JSON string' },
  // math
  abs: { arity: 1, sig: 'abs n', doc: '' },
  round: { arity: 1, sig: 'round n', doc: '' },
  roundTo: { arity: 2, sig: 'roundTo digits n', doc: '' },
  floor: { arity: 1, sig: 'floor n', doc: '' },
  ceil: { arity: 1, sig: 'ceil n', doc: '' },
  sqrt: { arity: 1, sig: 'sqrt n', doc: '' },
  pow: { arity: 2, sig: 'pow a b', doc: 'a^b' },
  // misc
  type: { arity: 1, sig: 'type x', doc: '"num" "str" "bool" "null" "list" "map" "fn"' },
  empty: { arity: 1, sig: 'empty x', doc: 'true if null or len 0' },
  err: { arity: 1, sig: 'err msg', doc: 'raise an error (catchable)' },
}

function makeBuiltins(rt) {
  const B = {}
  const def = (name, fn) => { B[name] = { kind: 'builtin', name, arity: BUILTIN_SPECS[name].arity, fn } }
  const T = typeOf
  const short = v => { const s = display(v, true); return s.length > 40 ? s.slice(0, 37) + '…' : s }
  const want = (v, types, n, what, node) => {
    if (!types.includes(T(v)))
      terr('E_TYPE', `${what || 'argument'} of \`${n}\` must be ${types.join(' or ')}, got ${T(v)} (${short(v)})`, node)
  }
  const wantFn = (f, n, node) => { if (T(f) !== 'fn') terr('E_TYPE', `first argument of \`${n}\` must be a function, got ${T(f)}`, node) }
  const call1 = (f, x, node) => rt.applyN(f, [x], node)
  const keyStr = v => T(v) === 'str' ? v : display(v, true)

  // io
  def('print', (rt2, [x]) => { rt.host.print(display(x)); return x })
  def('read', (rt2, [p], node) => { want(p, ['str'], 'read', 'path', node); try { return rt.host.read(p) } catch (e) { terr('E_IO', `cannot read ${JSON.stringify(p)}: ${e?.code || e?.message || e}`, node, { hint: 'wrap with `catch` to provide a fallback' }) } })
  def('write', (rt2, [p, s], node) => { want(p, ['str'], 'write', 'path', node); want(s, ['str'], 'write', 'content', node); try { rt.host.write(p, s); return null } catch (e) { terr('E_IO', `cannot write ${JSON.stringify(p)}: ${e?.code || e?.message || e}`, node) } })
  def('append', (rt2, [p, s], node) => { want(p, ['str'], 'append', 'path', node); want(s, ['str'], 'append', 'content', node); try { rt.host.append(p, s); return null } catch (e) { terr('E_IO', `cannot append ${JSON.stringify(p)}: ${e?.code || e?.message || e}`, node) } })
  def('env', (rt2, [k], node) => { want(k, ['str'], 'env', 'name', node); return rt.host.env(k) ?? null })
  def('args', () => [...rt.args])
  def('stdin', () => rt.host.stdin())
  def('now', () => rt.host.now())
  def('rand', () => rt.host.rand())

  // strings
  def('lines', (rt2, [s], node) => { want(s, ['str'], 'lines', 's', node); const a = s.split(/\r?\n/); if (a.length && a[a.length - 1] === '') a.pop(); return a })
  def('words', (rt2, [s], node) => { want(s, ['str'], 'words', 's', node); return s.split(/\s+/).filter(Boolean) })
  def('chars', (rt2, [s], node) => { want(s, ['str'], 'chars', 's', node); return [...s] })
  def('trim', (rt2, [s], node) => { want(s, ['str'], 'trim', 's', node); return s.trim() })
  def('upper', (rt2, [s], node) => { want(s, ['str'], 'upper', 's', node); return s.toUpperCase() })
  def('lower', (rt2, [s], node) => { want(s, ['str'], 'lower', 's', node); return s.toLowerCase() })
  def('split', (rt2, [sep, s], node) => { want(sep, ['str'], 'split', 'sep', node); want(s, ['str'], 'split', 's', node); return sep === '' ? [...s] : s.split(sep) })
  def('join', (rt2, [sep, xs], node) => { want(sep, ['str'], 'join', 'sep', node); want(xs, ['list'], 'join', 'xs', node); return xs.map(x => display(x)).join(sep) })
  def('replace', (rt2, [a, b, s], node) => { want(a, ['str'], 'replace', 'old', node); want(b, ['str'], 'replace', 'new', node); want(s, ['str'], 'replace', 's', node); return s.split(a).join(b) })
  def('starts', (rt2, [p, s], node) => { want(p, ['str'], 'starts', 'prefix', node); want(s, ['str'], 'starts', 's', node); return s.startsWith(p) })
  def('ends', (rt2, [p, s], node) => { want(p, ['str'], 'ends', 'suffix', node); want(s, ['str'], 'ends', 's', node); return s.endsWith(p) })
  def('rep', (rt2, [n, x], node) => { want(n, ['num'], 'rep', 'n', node); const k = Math.max(0, Math.floor(n)); return T(x) === 'str' ? x.repeat(k) : Array(k).fill(x) })
  def('num', (rt2, [s], node) => {
    if (T(s) === 'num') return s
    if (T(s) === 'bool') return s ? 1 : 0
    want(s, ['str'], 'num', 's', node)
    const t = s.trim()
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) terr('E_NUM', `\`num\` cannot parse ${JSON.stringify(s)}`, node, { hint: 'wrap with `catch` for a fallback value' })
    return Number(t)
  })
  def('str', (rt2, [x]) => display(x))

  // lists
  def('len', (rt2, [x], node) => { const t = T(x); if (t === 'str') return x.length; if (t === 'list') return x.length; if (t === 'map') return x.size; terr('E_TYPE', `\`len\` needs str/list/map, got ${t}`, node) })
  def('range', (rt2, [a, b], node) => { want(a, ['num'], 'range', 'a', node); want(b, ['num'], 'range', 'b', node); const out = []; for (let i = Math.ceil(a); i < b; i++) out.push(i); return out })
  def('map', (rt2, [f, xs], node) => { wantFn(f, 'map', node); want(xs, ['list'], 'map', 'xs', node); return xs.map(x => call1(f, x, node)) })
  def('keep', (rt2, [f, xs], node) => { wantFn(f, 'keep', node); want(xs, ['list'], 'keep', 'xs', node); return xs.filter(x => truthy(call1(f, x, node))) })
  def('each', (rt2, [f, xs], node) => { wantFn(f, 'each', node); want(xs, ['list'], 'each', 'xs', node); for (const x of xs) call1(f, x, node); return null })
  def('fold', (rt2, [f, init, xs], node) => { wantFn(f, 'fold', node); want(xs, ['list'], 'fold', 'xs', node); let acc = init; for (const x of xs) acc = rt.applyN(f, [acc, x], node); return acc })
  def('sum', (rt2, [xs], node) => { want(xs, ['list'], 'sum', 'xs', node); let s = 0; for (const x of xs) { want(x, ['num'], 'sum', 'element', node); s += x } return s })
  def('min', (rt2, [xs], node) => extremum(xs, node, 'min', (a, b) => a < b))
  def('max', (rt2, [xs], node) => extremum(xs, node, 'max', (a, b) => a > b))
  const wantNums = (xs, name, node) => {
    want(xs, ['list'], name, 'xs', node)
    if (!xs.length) terr('E_EMPTY', `\`${name}\` of an empty list`, node, { hint: 'guard with `if xs { … }` or use catch' })
    for (const x of xs) want(x, ['num'], name, 'element', node)
  }
  def('mean', (rt2, [xs], node) => { wantNums(xs, 'mean', node); return xs.reduce((s, x) => s + x, 0) / xs.length })
  def('median', (rt2, [xs], node) => {
    wantNums(xs, 'median', node)
    const a = [...xs].sort((x, y) => x - y), n = a.length
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2
  })
  def('stdev', (rt2, [xs], node) => {
    wantNums(xs, 'stdev', node)
    const m = xs.reduce((s, x) => s + x, 0) / xs.length
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length)
  })
  function extremum(xs, node, name, lt) {
    want(xs, ['list'], name, 'xs', node)
    if (!xs.length) terr('E_EMPTY', `\`${name}\` of an empty list`, node, { hint: 'guard with `if xs { … }` or use catch' })
    let best = xs[0]
    for (const x of xs) { cmpGuard(x, best, node, name); if (lt(x, best)) best = x }
    return best
  }
  function cmpGuard(a, b, node, name) {
    const ta = T(a), tb = T(b)
    if (ta !== tb || (ta !== 'num' && ta !== 'str'))
      terr('E_TYPE', `\`${name}\` needs all numbers or all strings (got ${ta} and ${tb})`, node)
  }
  def('sort', (rt2, [xs], node) => { want(xs, ['list'], 'sort', 'xs', node); const a = [...xs]; for (const x of a) cmpGuard(x, a[0], node, 'sort'); return a.sort((x, y) => x < y ? -1 : x > y ? 1 : 0) })
  def('sortBy', (rt2, [f, xs], node) => {
    wantFn(f, 'sortBy', node); want(xs, ['list'], 'sortBy', 'xs', node)
    const keyed = xs.map(x => [call1(f, x, node), x])
    for (const [k] of keyed) cmpGuard(k, keyed[0][0], node, 'sortBy')
    return keyed.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(p => p[1])
  })
  def('rev', (rt2, [x], node) => { const t = T(x); if (t === 'list') return [...x].reverse(); if (t === 'str') return [...x].reverse().join(''); terr('E_TYPE', `\`rev\` needs list or str, got ${t}`, node) })
  def('uniq', (rt2, [xs], node) => { want(xs, ['list'], 'uniq', 'xs', node); const seen = new Set(), out = []; for (const x of xs) { const k = T(x) + ':' + display(x, true); if (!seen.has(k)) { seen.add(k); out.push(x) } } return out })
  def('group', (rt2, [f, xs], node) => {
    wantFn(f, 'group', node); want(xs, ['list'], 'group', 'xs', node)
    const m = new Map()
    for (const x of xs) { const k = keyStr(call1(f, x, node)); if (!m.has(k)) m.set(k, []); m.get(k).push(x) }
    return m
  })
  def('counts', (rt2, [xs], node) => { want(xs, ['list'], 'counts', 'xs', node); const m = new Map(); for (const x of xs) { const k = keyStr(x); m.set(k, (m.get(k) || 0) + 1) } return m })
  def('top', (rt2, [n, m], node) => {
    want(n, ['num'], 'top', 'n', node)
    let pairs
    if (T(m) === 'map') pairs = [...m.entries()].map(([k, v]) => new Map([['k', k], ['v', v]]))
    else if (T(m) === 'list') pairs = m.map(p => { if (T(p) !== 'map' || !p.has('v')) terr('E_TYPE', '`top` needs a map or a list of {k, v} items', node); return p })
    else terr('E_TYPE', `\`top\` needs a map or a list of {k, v} items, got ${T(m)}`, node)
    for (const p of pairs) cmpGuard(p.get('v'), pairs[0]?.get('v'), node, 'top')
    return pairs.sort((a, b) => a.get('v') < b.get('v') ? 1 : a.get('v') > b.get('v') ? -1 : 0).slice(0, Math.max(0, n))
  })
  def('zip', (rt2, [a, b], node) => { want(a, ['list'], 'zip', 'xs', node); want(b, ['list'], 'zip', 'ys', node); const n = Math.min(a.length, b.length), out = []; for (let i = 0; i < n; i++) out.push([a[i], b[i]]); return out })
  def('flat', (rt2, [xs], node) => { want(xs, ['list'], 'flat', 'xs', node); return xs.flatMap(x => Array.isArray(x) ? x : [x]) })
  def('first', (rt2, [xs], node) => { want(xs, ['list', 'str'], 'first', 'xs', node); return xs.length ? xs[0] : null })
  def('last', (rt2, [xs], node) => { want(xs, ['list', 'str'], 'last', 'xs', node); return xs.length ? xs[xs.length - 1] : null })
  def('take', (rt2, [n, x], node) => { want(n, ['num'], 'take', 'n', node); want(x, ['list', 'str'], 'take', 'x', node); return x.slice(0, Math.max(0, n)) })
  def('skip', (rt2, [n, x], node) => { want(n, ['num'], 'skip', 'n', node); want(x, ['list', 'str'], 'skip', 'x', node); return x.slice(Math.max(0, n)) })
  def('push', (rt2, [x, xs], node) => { want(xs, ['list'], 'push', 'xs', node); xs.push(x); return xs })
  def('pop', (rt2, [xs], node) => { want(xs, ['list'], 'pop', 'xs', node); return xs.length ? xs.pop() : null })
  def('has', (rt2, [x, coll], node) => hasImpl(x, coll, node))
  function hasImpl(x, coll, node) {
    const t = T(coll)
    if (t === 'list') return coll.some(el => deepEq(el, x))
    if (t === 'str') { want(x, ['str'], 'has', 'needle', node); return coll.includes(x) }
    if (t === 'map') return coll.has(keyStr(x))
    terr('E_TYPE', `\`has\`/\`in\` needs list, str, or map on the right, got ${t}`, node)
  }
  rt.hasImpl = hasImpl
  def('find', (rt2, [f, xs], node) => { wantFn(f, 'find', node); want(xs, ['list'], 'find', 'xs', node); for (const x of xs) if (truthy(call1(f, x, node))) return x; return null })
  def('pos', (rt2, [x, xs], node) => {
    const t = T(xs)
    if (t === 'list') { for (let i = 0; i < xs.length; i++) if (deepEq(xs[i], x)) return i; return null }
    if (t === 'str') { want(x, ['str'], 'pos', 'needle', node); const i = xs.indexOf(x); return i < 0 ? null : i }
    terr('E_TYPE', `\`pos\` needs list or str, got ${t}`, node)
  })
  def('any', (rt2, [f, xs], node) => { wantFn(f, 'any', node); want(xs, ['list'], 'any', 'xs', node); return xs.some(x => truthy(call1(f, x, node))) })
  def('all', (rt2, [f, xs], node) => { wantFn(f, 'all', node); want(xs, ['list'], 'all', 'xs', node); return xs.every(x => truthy(call1(f, x, node))) })

  // maps
  def('keys', (rt2, [m], node) => { want(m, ['map'], 'keys', 'm', node); return [...m.keys()] })
  def('vals', (rt2, [m], node) => { want(m, ['map'], 'vals', 'm', node); return [...m.values()] })
  def('get', (rt2, [k, x], node) => {
    const t = T(x)
    if (t === 'map') { const v = x.get(keyStr(k)); return v === undefined ? null : v }
    if (t === 'list' || t === 'str') {
      want(k, ['num'], 'get', 'index', node)
      const i = k < 0 ? x.length + k : k
      if (i < 0 || i >= x.length || !Number.isInteger(k)) return null
      return x[i]
    }
    terr('E_TYPE', `\`get\` needs map, list, or str, got ${t}`, node)
  })
  def('put', (rt2, [k, v, m], node) => { want(m, ['map'], 'put', 'm', node); const out = new Map(m); out.set(keyStr(k), v); return out })
  def('del', (rt2, [k, m], node) => { want(m, ['map'], 'del', 'm', node); const out = new Map(m); out.delete(keyStr(k)); return out })
  def('merge', (rt2, [a, b], node) => { want(a, ['map'], 'merge', 'a', node); want(b, ['map'], 'merge', 'b', node); const out = new Map(a); for (const [k, v] of b) out.set(k, v); return out })
  def('items', (rt2, [m], node) => { want(m, ['map'], 'items', 'm', node); return [...m.entries()].map(([k, v]) => new Map([['k', k], ['v', v]])) })
  def('toMap', (rt2, [xs], node) => {
    want(xs, ['list'], 'toMap', 'pairs', node)
    const out = new Map()
    for (const p of xs) {
      if (T(p) === 'map' && p.has('k')) out.set(keyStr(p.get('k')), p.get('v') ?? null)
      else if (T(p) === 'list' && p.length === 2) out.set(keyStr(p[0]), p[1])
      else terr('E_TYPE', '`toMap` needs a list of {k, v} maps or [k, v] pairs', node)
    }
    return out
  })

  // json
  def('json', (rt2, [s], node) => {
    want(s, ['str'], 'json', 's', node)
    try { return fromJson(JSON.parse(s)) } catch (e) { terr('E_JSON', `invalid JSON: ${e.message}`, node, { hint: 'wrap with `catch` for a fallback' }) }
  })
  def('tojson', (rt2, [x], node) => toJsonStr(x, 0, node))
  def('pretty', (rt2, [x], node) => toJsonStr(x, 2, node))
  function toJsonStr(x, indent, node) {
    const conv = v => {
      const t = T(v)
      if (t === 'map') { const o = {}; for (const [k, val] of v) o[k] = conv(val); return o }
      if (t === 'list') return v.map(conv)
      if (t === 'fn') terr('E_JSON', 'cannot serialize a function to JSON', node)
      if (t === 'num' && !Number.isFinite(v)) terr('E_JSON', `cannot serialize ${v} to JSON`, node)
      return v
    }
    return JSON.stringify(conv(x), null, indent || undefined)
  }
  function fromJson(v) {
    if (Array.isArray(v)) return v.map(fromJson)
    if (v && typeof v === 'object') { const m = new Map(); for (const [k, val] of Object.entries(v)) m.set(k, fromJson(val)); return m }
    return v
  }

  // math
  const m1 = (name, f) => def(name, (rt2, [n], node) => { want(n, ['num'], name, 'n', node); return f(n) })
  m1('abs', Math.abs); m1('round', Math.round); m1('floor', Math.floor); m1('ceil', Math.ceil)
  m1('sqrt', n => { if (n < 0) terr('E_MATH', 'sqrt of negative number'); return Math.sqrt(n) })
  def('pow', (rt2, [a, b], node) => { want(a, ['num'], 'pow', 'a', node); want(b, ['num'], 'pow', 'b', node); return Math.pow(a, b) })
  def('roundTo', (rt2, [d, n], node) => { want(d, ['num'], 'roundTo', 'digits', node); want(n, ['num'], 'roundTo', 'n', node); const f = Math.pow(10, d); return Math.round(n * f) / f })

  // misc
  def('type', (rt2, [x]) => typeOf(x))
  def('empty', (rt2, [x], node) => { const t = T(x); if (t === 'null') return true; if (t === 'str' || t === 'list') return x.length === 0; if (t === 'map') return x.size === 0; terr('E_TYPE', `\`empty\` needs str/list/map/null, got ${t}`, node) })
  def('err', (rt2, [msg], node) => terr('E_USER', display(msg), node))

  return B
}

// ---------------------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------------------

const MAX_DEPTH = 2000

export function createRuntime(opts = {}) {
  const rt = {
    host: opts.host || defaultBrowserHost(),
    args: opts.args || [],
    file: opts.file || '<til>',
    stack: [],
    globals: null,
    egs: [],
  }
  rt.builtins = makeBuiltins(rt)
  rt.globals = new Env(null)

  function lookup(name, env, node) {
    const v = env.get(name)
    if (v !== MISSING) return v
    if (name in rt.builtins) return rt.builtins[name]
    const cands = [...Object.keys(BUILTIN_SPECS)]
    for (let e = env; e; e = e.parent) for (const k of e.m.keys()) cands.push(k)
    const dym = suggest(name, cands)
    terr('E_NAME', `unknown name \`${name}\``, node, {
      didYouMean: dym.length ? dym : undefined,
      hint: 'all builtins are always in scope — til has no imports',
    })
  }

  function apply(f, a, node) {
    const t = f && f.kind === 'partial' ? f.target : f
    if (!t || (t.kind !== 'builtin' && t.kind !== 'fn'))
      terr('E_APPLY', `${typeOf(f)} value (${shortD(f)}) is not a function`, node, {
        hint: node?.pipe ? 'the right side of | must evaluate to a function' :
          typeOf(f) === 'num' && typeOf(a) === 'num' ? 'to subtract, space both sides: `a - 1`; `x -1` passes -1 as an argument' :
            'two values side by side are a call `f x`; if this is a multi-line list, check for missing commas',
      })
    const args = f.kind === 'partial' ? [...f.args, a] : [a]
    const need = arityOf(t)
    if (args.length < need) return { kind: 'partial', target: t, args }
    return invoke(t, args, node)
  }

  function invoke(t, args, node) {
    if (t.kind === 'builtin') return t.fn(rt, args, node)
    if (rt.stack.length >= MAX_DEPTH)
      terr('E_STACK', `recursion too deep (${MAX_DEPTH} calls)`, node, { hint: 'check the base case of your recursive function' })
    const env = new Env(t.env)
    t.params.forEach((p, i) => env.define(p, args[i]))
    rt.stack.push({ name: t.name || 'lambda', line: node?.line })
    try {
      if (t.exprBody) return evalNode(t.body, env)
      return execBlock(t.body, env)
    } catch (e) {
      if (e instanceof ReturnSig) return e.v
      if (e instanceof TilError && !e.locals) e.locals = snapshotLocals(env)
      throw e
    } finally { rt.stack.pop() }
  }

  rt.applyN = (f, args, node) => {
    let v = f
    for (const a of args) v = apply(v, a, node)
    return v
  }

  function shortD(v) { const s = display(v, true); return s.length > 30 ? s.slice(0, 27) + '…' : s }

  function snapshotLocals(env) {
    const out = {}
    let n = 0
    for (const [k, v] of env.m) {
      if (n++ >= 8) { out['…'] = 'more'; break }
      if (typeOf(v) === 'fn') continue
      const s = display(v, true)
      out[k] = s.length > 60 ? s.slice(0, 57) + '…' : s
    }
    return out
  }

  function execBlock(block, env) {
    let last = null
    for (const st of block.stmts) last = execStmt(st, env)
    return last
  }

  function execStmt(st, env) {
    switch (st.k) {
      case 'Fn': env.define(st.name, { kind: 'fn', name: st.name, params: st.params, body: st.body, exprBody: st.exprBody, env }); return null
      case 'Assign': {
        const v = evalNode(st.expr, env)
        assign(st.target, v, env)
        return null
      }
      case 'MultiAssign': {
        const vs = st.exprs.map(x => evalNode(x, env)) // all values first: swap-safe
        st.targets.forEach((t, i) => assign(t, vs[i], env))
        return null
      }
      case 'ExprStmt': return evalNode(st.expr, env)
      case 'Return': throw new ReturnSig(st.expr ? evalNode(st.expr, env) : null)
      case 'Ensure': {
        const v = evalNode(st.expr, env)
        if (!truthy(v)) terr('E_ENSURE', `ensure failed: ${st.src || 'condition'}`, st, {
          locals: snapshotLocals(env), hint: 'the values above show the state at the failing check',
        })
        return null
      }
      case 'Eg': rt.egs.push({ node: st, env }); return null
      case 'For': {
        const it = evalNode(st.iter, env)
        const seq = iterable(it, st)
        for (const x of seq) {
          env.set(st.name, x)
          try { execBlock(st.body, env) }
          catch (e) { if (e instanceof BreakSig) break; if (e instanceof ContinueSig) continue; throw e }
        }
        return null
      }
      case 'While': {
        let guard = 0
        while (truthy(evalNode(st.cond, env))) {
          if (++guard > 10_000_000) terr('E_LOOP', 'while loop exceeded 10,000,000 iterations', st, { hint: 'probable infinite loop — does the condition ever change?' })
          try { execBlock(st.body, env) }
          catch (e) { if (e instanceof BreakSig) break; if (e instanceof ContinueSig) continue; throw e }
        }
        return null
      }
      case 'Break': throw new BreakSig()
      case 'Continue': throw new ContinueSig()
    }
  }

  function iterable(v, node) {
    const t = typeOf(v)
    if (t === 'list') return v
    if (t === 'str') return [...v]
    if (t === 'map') return [...v.entries()].map(([k, val]) => new Map([['k', k], ['v', val]]))
    terr('E_TYPE', `cannot loop over ${t}`, node, { hint: 'for works on list, str, and map (as {k, v} items)' })
  }

  function assign(target, v, env) {
    if (target.k === 'Name') { env.set(target.name, v); return }
    if (target.k === 'Index') {
      const obj = evalNode(target.obj, env)
      const idx = evalNode(target.idx, env)
      const t = typeOf(obj)
      if (t === 'list') {
        if (typeOf(idx) !== 'num' || !Number.isInteger(idx)) terr('E_TYPE', 'list index must be an integer', target)
        const i = idx < 0 ? obj.length + idx : idx
        if (i < 0 || i >= obj.length) terr('E_INDEX', `index ${idx} out of range (len ${obj.length})`, target, { hint: 'to append use `xs = push x xs`' })
        obj[i] = v; return
      }
      if (t === 'map') { obj.set(typeOf(idx) === 'str' ? idx : display(idx, true), v); return }
      terr('E_TYPE', `cannot index-assign into ${t}`, target)
    }
    if (target.k === 'Dot') {
      const obj = evalNode(target.obj, env)
      if (typeOf(obj) !== 'map') terr('E_TYPE', `cannot set .${target.name} on ${typeOf(obj)}`, target)
      obj.set(target.name, v); return
    }
  }

  function evalNode(n, env) {
    switch (n.k) {
      case 'Num': return n.v
      case 'Bool': return n.v
      case 'Null': return null
      case 'Str': {
        let out = ''
        for (const part of n.parts) out += part.e !== undefined ? display(evalNode(part.e, env)) : part.s
        return out
      }
      case 'Name': return lookup(n.name, env, n)
      case 'List': return n.els.map(e => evalNode(e, env))
      case 'MapLit': {
        const m = new Map()
        for (const en of n.entries) {
          const k = en.key.lit !== undefined ? en.key.lit : display(evalNode(en.key.node, env))
          m.set(k, evalNode(en.val, env))
        }
        return m
      }
      case 'Lam': return { kind: 'fn', name: null, params: n.params, body: n.body, exprBody: false, env }
      case 'Call': {
        const f = evalNode(n.callee, env)
        const a = evalNode(n.arg, env)
        return withPos(n, () => apply(f, a, n))
      }
      case 'Call0': {
        const f = evalNode(n.callee, env)
        const t = f && f.kind === 'partial' ? f.target : f
        if (!t || (t.kind !== 'builtin' && t.kind !== 'fn')) terr('E_APPLY', `${typeOf(f)} value is not a function`, n)
        const got = f.kind === 'partial' ? f.args.length : 0
        const need = arityOf(t)
        if (need - got !== 0) terr('E_ARITY', `\`${t.name || 'fn'}\` needs ${need - got} more argument${need - got === 1 ? '' : 's'}`, n)
        return withPos(n, () => invoke(t, f.kind === 'partial' ? f.args : [], n))
      }
      case 'If': {
        if (truthy(evalNode(n.cond, env))) return execBlock(n.then, env)
        if (!n.els) return null
        return n.els.k === 'Block' ? execBlock(n.els, env) : evalNode(n.els, env)
      }
      case 'Match': {
        const v = evalNode(n.subject, env)
        for (const c of n.cases) {
          let cenv = env, ok = false
          if (c.pat.k === 'any') ok = true
          else if (c.pat.k === 'lit') ok = deepEq(v, c.pat.v)
          else if (c.pat.k === 'bind') { cenv = new Env(env); cenv.define(c.pat.name, v); ok = true }
          if (ok && c.guard) ok = truthy(evalNode(c.guard, cenv))
          if (ok) return c.body.k === 'Block' ? execBlock(c.body, cenv) : evalNode(c.body, cenv)
        }
        terr('E_MATCH', `no match case for ${display(v, true)}`, n, { hint: 'add a `_ ->` catch-all case' })
      }
      case 'Logic': {
        const l = evalNode(n.l, env)
        if (n.op === 'or') return truthy(l) ? l : evalNode(n.r, env)
        return truthy(l) ? evalNode(n.r, env) : l
      }
      case 'Un': {
        const v = evalNode(n.expr, env)
        if (n.op === 'not') return !truthy(v)
        if (typeOf(v) !== 'num') terr('E_TYPE', `unary - needs a number, got ${typeOf(v)}`, n)
        return -v
      }
      case 'Bin': return binOp(n, env)
      case 'Catch': {
        try { return evalNode(n.l, env) }
        catch (e) { if (e instanceof TilError) return evalNode(n.r, env); throw e }
      }
      case 'Index': {
        const obj = evalNode(n.obj, env)
        const idx = evalNode(n.idx, env)
        const t = typeOf(obj)
        if (t === 'list' || t === 'str') {
          if (typeOf(idx) !== 'num' || !Number.isInteger(idx)) terr('E_TYPE', `${t} index must be an integer, got ${display(idx, true)}`, n)
          const i = idx < 0 ? obj.length + idx : idx
          if (i < 0 || i >= obj.length) terr('E_INDEX', `index ${idx} out of range (len ${obj.length})`, n, { hint: 'use `get i xs` for a null-safe lookup' })
          return obj[i]
        }
        if (t === 'map') { const v = obj.get(typeOf(idx) === 'str' ? idx : display(idx, true)); return v === undefined ? null : v }
        terr('E_TYPE', `cannot index ${t}`, n)
      }
      case 'Dot': {
        const obj = evalNode(n.obj, env)
        const t = typeOf(obj)
        if (t === 'map') { const v = obj.get(n.name); return v === undefined ? null : v }
        terr('E_TYPE', `cannot read .${n.name} on ${t}${t === 'null' ? ' (value is null)' : ''}`, n,
          { hint: t === 'list' ? 'index lists with xs[0]' : undefined })
      }
      case 'Block': return execBlock(n, env)
    }
    terr('E_INTERNAL', `unhandled node ${n.k}`, n)
  }

  function withPos(n, f) {
    try { return f() }
    catch (e) {
      if (e instanceof TilError) {
        if (e.line === undefined) { e.line = n.line; e.col = n.col }
        if (!e.tilStack) e.tilStack = rt.stack.slice(-6).map(f2 => f2.name)
      }
      throw e
    }
  }

  function binOp(n, env) {
    const l = evalNode(n.l, env)
    const r = evalNode(n.r, env)
    const tl = typeOf(l), tr = typeOf(r)
    const op = n.op
    if (op === '==') return deepEq(l, r)
    if (op === '!=') return !deepEq(l, r)
    if (op === 'in') return rt.hasImpl(l, r, n)
    if (op === '+') {
      if (tl === 'num' && tr === 'num') return l + r
      if (tl === 'str' && tr === 'str') return l + r
      if (tl === 'list' && tr === 'list') return [...l, ...r]
      terr('E_TYPE', `cannot add ${tl} + ${tr}`, n, {
        hint: tl === 'str' || tr === 'str' ? 'no silent coercion: use "text {x}" interpolation, or `num s` / `str x` to convert' : 'maps merge with `merge a b`',
      })
    }
    if (op === '-' || op === '*' || op === '/' || op === '%') {
      if (tl !== 'num' || tr !== 'num') terr('E_TYPE', `\`${op}\` needs numbers, got ${tl} and ${tr}`, n,
        { hint: tl === 'fn' || tr === 'fn' ? 'for a negative argument write f (-1) — bare `f -1` parses as subtraction' : undefined })
      if ((op === '/' || op === '%') && r === 0) terr('E_DIV', `${op === '/' ? 'division' : 'modulo'} by zero`, n)
      if (op === '-') return l - r
      if (op === '*') return l * r
      if (op === '/') return l / r
      return ((l % r) + r) % r // floored modulo, like Python
    }
    // < <= > >=
    if ((tl === 'num' && tr === 'num') || (tl === 'str' && tr === 'str')) {
      if (op === '<') return l < r
      if (op === '<=') return l <= r
      if (op === '>') return l > r
      if (op === '>=') return l >= r
    }
    terr('E_TYPE', `cannot compare ${tl} ${op} ${tr}`, n, { hint: 'comparisons need two numbers or two strings' })
  }

  rt.evalNode = evalNode
  rt.execStmt = execStmt
  rt.execBlock = execBlock
  return rt
}

// Run a program. Returns { rt, value, ast }. Throws TilError on failure.
export function run(src, opts = {}) {
  const ast = opts.ast || parse(src, { file: opts.file })
  const rt = createRuntime(opts)
  rt.src = src
  let value = null
  // hoist top-level fns for mutual recursion
  for (const st of ast.stmts) if (st.k === 'Fn') rt.execStmt(st, rt.globals)
  for (const st of ast.stmts) {
    if (st.k === 'Fn') continue
    value = rt.execStmt(st, rt.globals)
  }
  return { rt, value, ast }
}

// Run the eg assertions collected during run(). Returns report list.
export function runEgs(rt) {
  const results = []
  for (const { node, env } of rt.egs) {
    const r = { src: node.src, line: node.line }
    try {
      if (node.expr.k === 'Bin' && node.expr.op === '==') {
        const l = rt.evalNode(node.expr.l, env)
        const rv = rt.evalNode(node.expr.r, env)
        r.pass = deepEq(l, rv)
        if (!r.pass) { r.left = display(l, true); r.right = display(rv, true) }
      } else {
        r.pass = truthy(rt.evalNode(node.expr, env))
      }
    } catch (e) {
      if (!(e instanceof TilError)) throw e
      r.pass = false
      r.error = formatError(e, rt.src, { plain: true })
    }
    results.push(r)
  }
  return results
}

// ---------------------------------------------------------------------------
// describe — compressed context card for agents
// ---------------------------------------------------------------------------

export function describe(src, file = '<til>') {
  const ast = parse(src, { file })
  const out = { file, fns: [], egs: 0, stmts: 0 }
  let current = null
  for (const st of ast.stmts) {
    if (st.k === 'Fn') {
      const ensures = []
      const body = st.exprBody ? [] : st.body.stmts
      for (const b of body) if (b.k === 'Ensure') ensures.push(b.src)
      current = { name: st.name, params: st.params, ensures, egs: [] }
      out.fns.push(current)
    } else if (st.k === 'Eg') {
      out.egs++
      if (current) current.egs.push(st.src)
    } else { out.stmts++; current = null }
  }
  return out
}

export function describeText(d) {
  const L = []
  L.push(`# ${d.file} — ${d.fns.length} fn, ${d.egs} eg, ${d.stmts} top-level stmts`)
  for (const f of d.fns) {
    L.push(`fn ${f.name}${f.params.length ? ' ' + f.params.join(' ') : ''}`)
    for (const en of f.ensures) L.push(`  ensure ${en}`)
    for (const eg of f.egs) L.push(`  eg ${eg}`)
  }
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

export function errorJson(e, src, file) {
  return {
    ok: false,
    code: e.code || 'E_UNKNOWN',
    msg: e.message,
    file: file || e.file,
    line: e.line ?? null,
    col: e.col ?? null,
    src: e.line && src ? (src.split('\n')[e.line - 1] ?? null) : null,
    didYouMean: e.didYouMean,
    hint: e.hint,
    locals: e.locals,
    stack: e.tilStack,
  }
}

export function formatError(e, src, opts = {}) {
  const color = opts.color && !opts.plain
  const red = s => color ? `\x1b[31m${s}\x1b[0m` : s
  const dim = s => color ? `\x1b[2m${s}\x1b[0m` : s
  const bold = s => color ? `\x1b[1m${s}\x1b[0m` : s
  const L = []
  const loc = e.line ? `${opts.file || 'til'}:${e.line}${e.col ? ':' + e.col : ''}` : (opts.file || 'til')
  L.push(`${red('error')}[${e.code || 'E_UNKNOWN'}] ${bold(e.message)}  ${dim('at ' + loc)}`)
  if (e.line && src) {
    const lineSrc = src.split('\n')[e.line - 1]
    if (lineSrc !== undefined) {
      L.push(dim(`  ${String(e.line).padStart(3)} | `) + lineSrc)
      if (e.col) L.push(' '.repeat(6 + String(e.line).length + e.col - 1) + red('^'))
    }
  }
  if (e.didYouMean?.length) L.push(`  did you mean: ${e.didYouMean.map(bold).join(' or ')}?`)
  if (e.locals && Object.keys(e.locals).length)
    L.push(dim('  locals: ') + Object.entries(e.locals).map(([k, v]) => `${k}=${v}`).join('  '))
  if (e.tilStack?.length) L.push(dim(`  in: ${e.tilStack.join(' → ')}`))
  if (e.hint) L.push(dim(`  hint: ${e.hint}`))
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

function defaultBrowserHost() {
  const files = new Map()
  const out = []
  return {
    kind: 'browser', files, out,
    print: s => out.push(s),
    read: p => { if (!files.has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e } return files.get(p) },
    write: (p, s) => files.set(p, s),
    append: (p, s) => files.set(p, (files.get(p) || '') + s),
    env: () => null,
    stdin: () => '',
    now: () => Date.now(),
    rand: () => Math.random(),
  }
}

export async function nodeHost() {
  const fs = await import('node:fs')
  return {
    kind: 'node',
    print: s => process.stdout.write(s + '\n'),
    read: p => fs.readFileSync(p, 'utf8'),
    write: (p, s) => fs.writeFileSync(p, s),
    append: (p, s) => fs.appendFileSync(p, s),
    env: k => process.env[k],
    stdin: () => { try { return fs.readFileSync(0, 'utf8') } catch { return '' } },
    now: () => Date.now(),
    rand: () => Math.random(),
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `til ${VERSION} — тіл — a language engineered for AI agents

usage:
  til run file.til [args…]     run a program (also: til file.til)
  til check file.til           parse + static checks, no execution
  til test file-or-dir         run all eg assertions
  til describe file.til        compressed interface card (for agent context)
  til teach                    print LLM.md — the whole language, prompt-sized
  til tokens file [--enc E]    count LLM tokens in a file (o200k_base default)

flags: --json (machine-readable output on check/test/describe/errors)`

export async function main(argv) {
  const host = await nodeHost()
  const fs = await import('node:fs')
  const path = await import('node:path')
  const url = await import('node:url')
  const json = argv.includes('--json')
  const args = argv.filter(a => a !== '--json')
  let cmd = args[0]
  if (cmd && cmd.endsWith('.til')) { args.unshift('run'); cmd = 'run' }

  const readSrc = f => {
    try { return fs.readFileSync(f, 'utf8') }
    catch { process.stderr.write(`til: cannot read ${f}\n`); process.exit(2) }
  }
  const color = process.stderr.isTTY

  const reportError = (e, src, file) => {
    if (!(e instanceof TilError)) throw e
    if (json) host.print(JSON.stringify(errorJson(e, src, file)))
    else process.stderr.write(formatError(e, src, { color, file }) + '\n')
    return 1
  }

  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h':
      host.print(USAGE); return 0

    case 'run': {
      const file = args[1]
      if (!file) { host.print(USAGE); return 2 }
      const src = readSrc(file)
      let ast
      try { ast = parse(src, { file }) } catch (e) { return reportError(e, src, file) }
      const { errors, warnings } = check(ast)
      for (const w of warnings) process.stderr.write(formatError({ ...w, message: 'warning: ' + w.msg }, src, { color, file }) + '\n')
      if (errors.length) {
        if (json) { host.print(JSON.stringify({ ok: false, errors: errors.map(e => errorJson({ ...e, message: e.msg }, src, file)) })); return 1 }
        for (const e of errors) process.stderr.write(formatError({ ...e, message: e.msg }, src, { color, file }) + '\n')
        return 1
      }
      try { run(src, { ast, host, file, args: args.slice(2) }) } catch (e) { return reportError(e, src, file) }
      return 0
    }

    case 'check': {
      const file = args[1]
      const src = readSrc(file)
      let ast
      try { ast = parse(src, { file }) } catch (e) { return reportError(e, src, file) }
      const { errors, warnings } = check(ast)
      if (json) { host.print(JSON.stringify({ ok: errors.length === 0, errors: errors.map(e => errorJson({ ...e, message: e.msg }, src, file)), warnings: warnings.map(w => errorJson({ ...w, message: w.msg }, src, file)) })); return errors.length ? 1 : 0 }
      for (const w of warnings) process.stderr.write(formatError({ ...w, message: 'warning: ' + w.msg }, src, { color, file }) + '\n')
      for (const e of errors) process.stderr.write(formatError({ ...e, message: e.msg }, src, { color, file }) + '\n')
      if (!errors.length) host.print(`${file}: ok (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`)
      return errors.length ? 1 : 0
    }

    case 'test': {
      const target = args[1] || '.'
      const files = []
      const stat = fs.statSync(target, { throwIfNoEntry: false })
      if (!stat) { process.stderr.write(`til: no such file ${target}\n`); return 2 }
      if (stat.isDirectory()) {
        for (const f of fs.readdirSync(target)) if (f.endsWith('.til') && !f.startsWith('broken')) files.push(path.join(target, f))
      } else files.push(target)
      let pass = 0, fail = 0
      const fileReports = []
      for (const f of files) {
        const src = readSrc(f)
        const t0 = Date.now()
        let results = []
        let crashed = null
        try {
          const ast = parse(src, { file: f })
          const { errors } = check(ast)
          if (errors.length) throw new TilError(errors[0].code, errors[0].msg, errors[0])
          const { rt } = run(src, { ast, host, file: f, args: [] })
          results = runEgs(rt)
        } catch (e) {
          if (!(e instanceof TilError)) throw e
          crashed = e
        }
        const ms = Date.now() - t0
        const p = results.filter(r => r.pass).length
        const fl = results.length - p
        pass += p; fail += fl + (crashed ? 1 : 0)
        fileReports.push({ file: f, pass: p, fail: fl, ms, crashed: crashed ? errorJson(crashed, src, f) : null, results })
        if (!json) {
          if (crashed) {
            host.print(`✗ ${f}  crashed`)
            process.stderr.write(formatError(crashed, src, { color, file: f }) + '\n')
          } else {
            host.print(`${fl ? '✗' : '✓'} ${f}  ${p}/${results.length} eg pass (${ms}ms)`)
            for (const r of results.filter(x => !x.pass)) {
              host.print(`   ✗ line ${r.line}: eg ${r.src}`)
              if (r.left !== undefined) host.print(`     left:  ${r.left}\n     right: ${r.right}`)
              if (r.error) host.print('     ' + r.error.split('\n').join('\n     '))
            }
          }
        }
      }
      if (json) host.print(JSON.stringify({ ok: fail === 0, pass, fail, files: fileReports }))
      else host.print(`${fail === 0 ? '✓' : '✗'} total: ${pass} pass, ${fail} fail`)
      return fail === 0 ? 0 : 1
    }

    case 'describe': {
      const file = args[1]
      const src = readSrc(file)
      try {
        const d = describe(src, file)
        host.print(json ? JSON.stringify(d) : describeText(d))
      } catch (e) { return reportError(e, src, file) }
      return 0
    }

    case 'teach': {
      const here = path.dirname(url.fileURLToPath(import.meta.url))
      const p = path.join(here, '..', 'LLM.md')
      host.print(fs.readFileSync(p, 'utf8'))
      return 0
    }

    case 'tokens': {
      const file = args[1]
      const src = readSrc(file)
      const encFlag = args.indexOf('--enc')
      const enc = encFlag > -1 ? args[encFlag + 1] : 'o200k_base'
      try {
        const mod = await import(`gpt-tokenizer/encoding/${enc}`)
        const n = mod.encode(src).length
        host.print(json ? JSON.stringify({ file, encoding: enc, tokens: n, chars: src.length }) : `${file}: ${n} tokens (${enc}), ${src.length} chars`)
      } catch {
        host.print(json ? JSON.stringify({ file, encoding: 'estimate', tokens: Math.round(src.length / 4), chars: src.length }) : `${file}: ~${Math.round(src.length / 4)} tokens (estimate: gpt-tokenizer not installed), ${src.length} chars`)
      }
      return 0
    }

    default:
      process.stderr.write(`til: unknown command \`${cmd}\`\n\n${USAGE}\n`)
      return 2
  }
}
