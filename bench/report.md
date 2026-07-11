# til benchmark — tokens for identical, output-verified programs

10/10 tasks verified: all three implementations produce **byte-identical stdout**.
Token counts are for full source files, measured with real tokenizers (`gpt-tokenizer`).

## o200k_base (GPT-4o / o-series)

| task | til | python | js | til vs py | til vs js |
|---|---:|---:|---:|---:|---:|
| anagrams | 43 | 50 | 94 | −14.0% | −54.3% |
| brackets | 97 | 100 | 136 | −3.0% | −28.7% |
| clean | 29 | 45 | 65 | −35.6% | −55.4% |
| csv | 53 | 60 | 90 | −11.7% | −41.1% |
| fib | 35 | 32 | 47 | +9.4% | −25.5% |
| fizzbuzz | 57 | 63 | 74 | −9.5% | −23.0% |
| inventory | 98 | 100 | 133 | −2.0% | −26.3% |
| json | 40 | 49 | 55 | −18.4% | −27.3% |
| stats | 61 | 72 | 190 | −15.3% | −67.9% |
| wordfreq | 30 | 36 | 106 | −16.7% | −71.7% |
| **total** | **543** | **607** | **990** | **−10.5%** | **−45.2%** |

## cl100k_base (GPT-4 / 3.5)

| task | til | python | js | til vs py | til vs js |
|---|---:|---:|---:|---:|---:|
| anagrams | 43 | 50 | 92 | −14.0% | −53.3% |
| brackets | 97 | 99 | 133 | −2.0% | −27.1% |
| clean | 29 | 43 | 60 | −32.6% | −51.7% |
| csv | 53 | 57 | 87 | −7.0% | −39.1% |
| fib | 35 | 32 | 47 | +9.4% | −25.5% |
| fizzbuzz | 57 | 63 | 74 | −9.5% | −23.0% |
| inventory | 98 | 100 | 129 | −2.0% | −24.0% |
| json | 40 | 47 | 53 | −14.9% | −24.5% |
| stats | 58 | 71 | 188 | −18.3% | −69.1% |
| wordfreq | 30 | 36 | 101 | −16.7% | −70.3% |
| **total** | **540** | **598** | **964** | **−9.7%** | **−44.0%** |

## characters

til 1527 · python 2047 (−25.4%) · js 3024 (−49.5%)

## method & fairness

- Python/JS solutions are written the way a competent LLM writes them: idiomatic, minimal, stdlib-only, no golfing and no padding. If you can write a materially shorter idiomatic version, file it — the gate is that stdout stays byte-identical.
- All solutions are comment-free; whitespace is each language's standard style.
- The Anthropic tokenizer is not public; o200k/cl100k are the standard proxies. Rankings are stable across both.
- Caveat: token count is a proxy for generation cost, not correctness. See README for the correctness argument (checker, contracts, structured errors).
