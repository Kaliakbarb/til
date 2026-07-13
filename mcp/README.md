# til MCP server

Exposes til to any MCP client. Zero dependencies; programs run against a **virtual
file system** — no disk, env, network, or stdin access, ever.

```bash
# Claude Code
claude mcp add til -- node /path/to/til/mcp/server.mjs
```

Tools: `til_teach` (the complete ~1.8k-token language card — call once per session),
`til_check` (static errors with didYouMean, as JSON), `til_run` (sandboxed execution:
pass input files as `{"data.txt": "…"}`; runs `eg` assertions; returns stdout + egs +
files the program wrote).
