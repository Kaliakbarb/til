// til for VS Code: live diagnostics + did-you-mean quick fixes, zero dependencies.
// Runs `til check --json` (path configurable via til.path) on open/change/save.
const vscode = require('vscode')
const cp = require('child_process')
const path = require('path')

let collection, timer

function tilBin() {
  const cfg = vscode.workspace.getConfiguration('til').get('path')
  if (cfg) return cfg
  // default: the repo this extension ships in, else `til` on PATH
  const guess = path.join(__dirname, '..', '..', 'bin', 'til')
  return require('fs').existsSync(guess) ? guess : 'til'
}

function checkDoc(doc) {
  if (doc.languageId !== 'til') return
  const fs = require('fs')
  const os = require('os')
  const tmp = path.join(os.tmpdir(), `til-vscode-${process.pid}.til`)
  fs.writeFileSync(tmp, doc.getText())
  const bin = tilBin()
  const useNode = bin.includes('bin/til') || bin.endsWith('.js') || bin.endsWith('.mjs')
  const cmd = useNode ? 'node' : bin
  const args = useNode ? [bin, 'check', tmp, '--json'] : ['check', tmp, '--json']
  cp.execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
    const diags = []
    try {
      const line = stdout.trim().split('\n').pop()
      const j = JSON.parse(line)
      for (const e of [...(j.errors || []), ...(j.warnings || [])]) {
        const ln = Math.max(0, (e.line ?? 1) - 1)
        const col = Math.max(0, (e.col ?? 1) - 1)
        const nameLen = (e.msg || '').match(/`([A-Za-z_][A-Za-z0-9_]*)`/)?.[1]?.length || 1
        const d = new vscode.Diagnostic(
          new vscode.Range(ln, col, ln, col + nameLen),
          e.msg + (e.hint ? ` — ${e.hint}` : ''),
          (j.errors || []).includes(e) ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
        )
        d.code = e.code
        d.source = 'til'
        d.didYouMean = e.didYouMean
        diags.push(d)
      }
    } catch { /* no parse → leave empty */ }
    collection.set(doc.uri, diags)
  })
}

function activate(context) {
  collection = vscode.languages.createDiagnosticCollection('til')
  const debounced = doc => { clearTimeout(timer); timer = setTimeout(() => checkDoc(doc), 350) }

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(checkDoc),
    vscode.workspace.onDidSaveTextDocument(checkDoc),
    vscode.workspace.onDidChangeTextDocument(e => debounced(e.document)),
    vscode.languages.registerCodeActionsProvider('til', {
      provideCodeActions(doc, range, ctx) {
        const actions = []
        for (const d of ctx.diagnostics) {
          for (const s of d.didYouMean || []) {
            const a = new vscode.CodeAction(`til: replace with \`${s}\``, vscode.CodeActionKind.QuickFix)
            a.edit = new vscode.WorkspaceEdit()
            a.edit.replace(doc.uri, d.range, s)
            a.diagnostics = [d]
            actions.push(a)
          }
        }
        return actions
      },
    }),
    vscode.commands.registerCommand('til.run', () => {
      const doc = vscode.window.activeTextEditor?.document
      if (!doc || doc.languageId !== 'til') return
      const term = vscode.window.createTerminal('til')
      term.show()
      const bin = tilBin()
      term.sendText(bin.includes('bin/til') ? `node "${bin}" run "${doc.fileName}"` : `${bin} run "${doc.fileName}"`)
    }),
  )
  vscode.workspace.textDocuments.forEach(checkDoc)
}

module.exports = { activate, deactivate() {} }
