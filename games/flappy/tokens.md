# flappy — token comparison (same game, same constants, per SPEC.md)

| | til (web host) | python (pygame) | js (canvas) |
|---|---:|---:|---:|
| o200k tokens | **645** | 810 (til −20.4%) | 777 (til −17.0%) |
| cl100k tokens | **645** | 808 (til −20.2%) | 758 (til −14.9%) |
| non-blank lines | 78 | 70 | 73 |

Fairness notes: til draws through 7 host builtins (rect/circle/text/pressed/key/width/height) — designing that surface is part of owning the language, and the equivalent surface exists in each baseline (pygame’s API for Python; tiny idiomatic canvas helpers for JS). All three implement the identical spec checklist and are verified (til: games/flappy/verify.mjs, 2000-frame deterministic run; py: headless pygame drive; js: stubbed-DOM frame pump).
