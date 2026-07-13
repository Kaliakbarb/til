# constrained decoding demo (ready to run)

`til grammar` emits a GBNF superset of the language. Paired with llama.cpp, any local
model can be *forced* to emit til-shaped tokens — the co-design answer to "just use
tooling on Python": a small regular grammar is what makes constrainers sound.

Not executed in this repo's CI (needs a local model download). To run:

```bash
brew install llama.cpp                              # or build from source
node bin/til grammar > /tmp/til.gbnf
# any small instruct model works; ~0.4 GB example:
llama-cli -hf Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --grammar-file /tmp/til.gbnf \
  -p "$(node bin/til teach)\n\nWrite a til program that prints the sum of even numbers in numbers.txt:" \
  -n 200
```

Expected: every sampled token stays inside the grammar; `til check` remains the
semantic gate afterward (the grammar is deliberately a superset — see src/til.mjs).
