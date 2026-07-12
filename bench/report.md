# til benchmark — tokens for identical, output-verified programs

10/10 tasks verified: all three implementations produce **byte-identical stdout**.
Token counts are for full source files, measured with real tokenizers (`gpt-tokenizer`).

## o200k_base (GPT-4o / o-series)

| task | til | python | js | til vs py | til vs js |
|---|---:|---:|---:|---:|---:|
| anagrams | 43 | 50 | 76 | −14.0% | −43.4% |
| brackets | 97 | 91 | 123 | +6.6% | −21.1% |
| clean | 29 | 31 | 58 | −6.5% | −50.0% |
| csv | 53 | 60 | 90 | −11.7% | −41.1% |
| fib | 35 | 32 | 47 | +9.4% | −25.5% |
| fizzbuzz | 57 | 51 | 57 | +11.8% | −0.0% |
| inventory | 98 | 94 | 119 | +4.3% | −17.6% |
| json | 40 | 46 | 51 | −13.0% | −21.6% |
| stats | 61 | 68 | 190 | −10.3% | −67.9% |
| wordfreq | 30 | 33 | 98 | −9.1% | −69.4% |
| **total** | **543** | **556** | **909** | **−2.3%** | **−40.3%** |

## cl100k_base (GPT-4 / 3.5)

| task | til | python | js | til vs py | til vs js |
|---|---:|---:|---:|---:|---:|
| anagrams | 43 | 50 | 74 | −14.0% | −41.9% |
| brackets | 97 | 90 | 120 | +7.8% | −19.2% |
| clean | 29 | 31 | 55 | −6.5% | −47.3% |
| csv | 53 | 57 | 87 | −7.0% | −39.1% |
| fib | 35 | 32 | 47 | +9.4% | −25.5% |
| fizzbuzz | 57 | 51 | 57 | +11.8% | −0.0% |
| inventory | 98 | 94 | 115 | +4.3% | −14.8% |
| json | 40 | 45 | 49 | −11.1% | −18.4% |
| stats | 58 | 68 | 188 | −14.7% | −69.1% |
| wordfreq | 30 | 33 | 93 | −9.1% | −67.7% |
| **total** | **540** | **551** | **885** | **−2.0%** | **−39.0%** |

## characters

til 1527 · python 1862 (−18.0%) · js 2726 (−44.0%)

## method & fairness

- Python/JS solutions are written the way a competent LLM writes them: idiomatic, minimal, stdlib-only, no golfing and no padding. If you can write a materially shorter idiomatic version, file it — the gate is that stdout stays byte-identical.
- All solutions are comment-free; whitespace is each language's standard style.
- The Anthropic tokenizer is not public; o200k/cl100k are the standard proxies. Rankings are stable across both.
- Caveat: token count is a proxy for generation cost, not correctness. See README for the correctness argument (checker, contracts, structured errors).
- Baselines were adversarially re-optimized by an independent auditor; every shorter byte-identical idiomatic version found was adopted. Known input-shaped equivalences are documented: Python round() is banker's vs til/JS half-up (dataset avoids .xx5 boundaries); compact-JSON output spec costs Python a separators tax.
