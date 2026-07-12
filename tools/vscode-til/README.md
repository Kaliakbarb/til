# vscode-til

Syntax highlighting for [til](https://til-lang.vercel.app) — a scripting language for data/text/file tasks, designed for AI agents. Highlights `.til` files.

## What it covers

- `#` comments, keywords, `true`/`false`/`null`
- `"…"` strings with escape sequences and `{expr}` interpolation (the embedded expression is fully highlighted); `'…'` raw strings
- Numbers (`1_000`, `1.5`, `1.5e3`), operators, pipes
- `fn name params` definitions (function name + parameters) and all ~75 builtins

## Install

Copy this folder into your VS Code extensions directory:

    cp -r tools/vscode-til ~/.vscode/extensions/vscode-til-0.2.1

Then reload VS Code. Alternatively, run `vsce package` here and `code --install-extension vscode-til-0.2.1.vsix`.
