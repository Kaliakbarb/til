#!/usr/bin/env node
// til MCP server — exposes the language to any MCP client (Claude Code, Cursor, …).
// Zero dependencies: newline-delimited JSON-RPC over stdio, per the MCP spec.
//
// Sandboxed by construction: programs run against a VIRTUAL file system seeded
// only from the `files` argument — no disk, no env, no network, no stdin.
//
// Register (Claude Code):  claude mcp add til -- node /path/to/til/mcp/server.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, check, run, runEgs, errorJson, VERSION } from '../src/til.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const CARD = fs.readFileSync(path.join(here, '..', 'LLM.md'), 'utf8')

const TOOLS = [
  {
    name: 'til_teach',
    description: 'Return the complete til language specification (~1.8k tokens). Read this ONCE before writing any til code — it is the entire language; nothing outside it exists.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'til_check',
    description: 'Statically check a til program without running it: syntax, unknown names (with didYouMean), arity, placement. Returns structured errors built for one-shot repair.',
    inputSchema: {
      type: 'object',
      properties: { source: { type: 'string', description: 'the til program' } },
      required: ['source'],
    },
  },
  {
    name: 'til_run',
    description: 'Run a til program in a sandbox (virtual fs only — no real disk/env/network). Executes its eg assertions too. Returns stdout, eg results, and structured errors on failure.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'the til program' },
        files: { type: 'object', description: 'virtual input files: {"data.txt": "contents"}', additionalProperties: { type: 'string' } },
        args: { type: 'array', items: { type: 'string' }, description: 'values returned by args()' },
      },
      required: ['source'],
    },
  },
]

function virtualHost(seed = {}) {
  const files = new Map(Object.entries(seed))
  const out = []
  return {
    out, files,
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

function toolCall(name, a = {}) {
  if (name === 'til_teach') return { text: CARD }
  if (name === 'til_check') {
    let ast
    try { ast = parse(String(a.source ?? ''), { file: 'mcp.til' }) }
    catch (e) { return { text: JSON.stringify({ ok: false, errors: [errorJson(e, a.source, 'mcp.til')] }), isError: true } }
    const { errors, warnings } = check(ast)
    return {
      text: JSON.stringify({
        ok: errors.length === 0,
        errors: errors.map(e => errorJson({ ...e, message: e.msg }, a.source, 'mcp.til')),
        warnings: warnings.map(w => ({ code: w.code, msg: w.msg, line: w.line })),
      }),
      isError: errors.length > 0,
    }
  }
  if (name === 'til_run') {
    const src = String(a.source ?? '')
    const host = virtualHost(a.files || {})
    let ast
    try { ast = parse(src, { file: 'mcp.til' }) }
    catch (e) { return { text: JSON.stringify({ ok: false, error: errorJson(e, src, 'mcp.til') }), isError: true } }
    const { errors } = check(ast)
    if (errors.length) return { text: JSON.stringify({ ok: false, error: errorJson({ ...errors[0], message: errors[0].msg }, src, 'mcp.til') }), isError: true }
    try {
      const { rt } = run(src, { ast, host, file: 'mcp.til', args: a.args || [] })
      const egs = runEgs(rt).map(r => ({ pass: r.pass, src: r.src, line: r.line, left: r.left, right: r.right }))
      const written = {}
      for (const [k, v] of host.files) if (!(a.files || {})[k] || (a.files || {})[k] !== v) written[k] = String(v).slice(0, 2000)
      const ok = egs.every(e => e.pass)
      return {
        text: JSON.stringify({ ok, stdout: host.out.join('\n'), egs, filesWritten: written }),
        isError: !ok,
      }
    } catch (e) {
      if (!e?.til) throw e
      return { text: JSON.stringify({ ok: false, error: errorJson(e, src, 'mcp.til'), stdout: host.out.join('\n') }), isError: true }
    }
  }
  throw new Error(`unknown tool ${name}`)
}

// ---- newline-delimited JSON-RPC over stdio ----
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (line) handle(line)
  }
})

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function handle(line) {
  let req
  try { req = JSON.parse(line) } catch { return }
  const { id, method, params } = req
  const reply = result => id !== undefined && send({ jsonrpc: '2.0', id, result })
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } })
  try {
    if (method === 'initialize') {
      reply({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'til', version: VERSION },
        instructions: 'til is a scripting language for agents. Call til_teach ONCE to learn it (the ~1.8k-token result is the complete language), then loop: write → til_check → til_run. Errors are structured for one-shot repair.',
      })
    } else if (method === 'tools/list') {
      reply({ tools: TOOLS })
    } else if (method === 'tools/call') {
      const r = toolCall(params.name, params.arguments || {})
      reply({ content: [{ type: 'text', text: r.text }], isError: !!r.isError })
    } else if (method === 'ping') {
      reply({})
    } else if (id !== undefined) {
      fail(-32601, `method not found: ${method}`)
    }
  } catch (e) {
    fail(-32000, String(e?.message || e))
  }
}
