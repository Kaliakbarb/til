#!/usr/bin/env node
// til language server — LSP over stdio, zero dependencies.
// Diagnostics come straight from the same checker the CLI uses; did-you-mean
// suggestions surface as quick-fix code actions.
//
//   Neovim:  vim.lsp.start { name = 'til', cmd = { 'node', '/path/to/til/tools/lsp/server.mjs' },
//                            filetypes = { 'til' } }
//   Helix:   [language-server.til] command = "node", args = ["/path/to/til/tools/lsp/server.mjs"]
//   VS Code: the bundled extension (tools/vscode-til) uses `til check --json` directly.
import { parse, check, TilError } from '../../src/til.mjs'

const docs = new Map()   // uri -> text
let buf = Buffer.alloc(0)

process.stdin.on('data', chunk => {
  buf = Buffer.concat([buf, chunk])
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = buf.slice(0, headerEnd).toString('utf8')
    const m = header.match(/Content-Length: (\d+)/i)
    if (!m) { buf = buf.slice(headerEnd + 4); continue }
    const len = Number(m[1])
    if (buf.length < headerEnd + 4 + len) return
    const body = buf.slice(headerEnd + 4, headerEnd + 4 + len).toString('utf8')
    buf = buf.slice(headerEnd + 4 + len)
    try { handle(JSON.parse(body)) } catch { /* ignore malformed frames */ }
  }
})

function send(msg) {
  const s = JSON.stringify(msg)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`)
}

function diagnostics(text) {
  const out = []
  const push = (e, severity) => out.push({
    range: {
      start: { line: Math.max(0, (e.line ?? 1) - 1), character: Math.max(0, (e.col ?? 1) - 1) },
      end: { line: Math.max(0, (e.line ?? 1) - 1), character: Math.max(0, (e.col ?? 1) - 1) + ((e.msg || e.message || '').match(/`([A-Za-z_][A-Za-z0-9_]*)`/)?.[1]?.length || 1) },
    },
    severity,
    source: 'til',
    code: e.code,
    message: e.msg || e.message,
    data: { didYouMean: e.didYouMean },
  })
  try {
    const ast = parse(text, { file: 'lsp.til' })
    const { errors, warnings } = check(ast)
    for (const e of errors) push(e, 1)
    for (const w of warnings) push(w, 2)
  } catch (e) {
    if (e instanceof TilError) push({ code: e.code, msg: e.message, line: e.line, col: e.col }, 1)
  }
  return out
}

function publish(uri) {
  send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: diagnostics(docs.get(uri) || '') } })
}

function handle(req) {
  const { id, method, params } = req
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        capabilities: {
          textDocumentSync: 1, // full
          codeActionProvider: true,
        },
        serverInfo: { name: 'til-lsp' },
      },
    })
  } else if (method === 'textDocument/didOpen') {
    docs.set(params.textDocument.uri, params.textDocument.text)
    publish(params.textDocument.uri)
  } else if (method === 'textDocument/didChange') {
    docs.set(params.textDocument.uri, params.contentChanges[0].text)
    publish(params.textDocument.uri)
  } else if (method === 'textDocument/didClose') {
    docs.delete(params.textDocument.uri)
  } else if (method === 'textDocument/codeAction') {
    const actions = []
    for (const d of params.context?.diagnostics || []) {
      const dym = d.data?.didYouMean || []
      for (const suggestion of dym) {
        actions.push({
          title: `til: replace with \`${suggestion}\``,
          kind: 'quickfix',
          diagnostics: [d],
          edit: { changes: { [params.textDocument.uri]: [{ range: d.range, newText: suggestion }] } },
        })
      }
    }
    send({ jsonrpc: '2.0', id, result: actions })
  } else if (method === 'shutdown') {
    send({ jsonrpc: '2.0', id, result: null })
  } else if (method === 'exit') {
    process.exit(0)
  } else if (id !== undefined) {
    send({ jsonrpc: '2.0', id, result: null })
  }
}
