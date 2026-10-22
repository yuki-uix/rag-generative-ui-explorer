# Live card integration checks — 2026-10-22

These are small deployment smoke checks, not a frozen comparison, F5 result or
estimated user benefit. All paid calls use real retrieved passages and the
served DeepSeek profile. Iterations below are disclosed rather than counted as
independent evaluation samples. The semantic checks are by AI assistants in the implementation team, not
independent human adjudication.

## Observed failures during implementation

| Web configuration | Question | Result | Server time | Observed usage |
| --- | --- | --- | ---: | --- |
| Original planner schema, default thinking | Sparse versus dense (English) | 60s timeout; no cards | 60.01s | unavailable |
| Original planner schema, default thinking | Why reranking cannot raise recall (Chinese) | complete mechanism card | 44.41s | input 1284, cache-read 1408, output 2686 |
| `live-cards-1`, thinking disabled | Sparse versus dense | rejected unknown citation handles | 5.56s | input 2421, output 435 |
| `live-cards-1`, thinking disabled | Reranking / recall | rejected unknown citation handles | 5.99s | input 2613, output 369 |
| `live-cards-2`, handle schema corrected | Sparse versus dense | rejected card validation | 5.42s | input 2464, output 385 |
| `live-cards-2`, handle schema corrected | Reranking / recall | rejected card validation | 4.10s | input 1888, cache-read 768, output 238 |
| `live-cards-2`, one diagnostic call | Sparse versus dense | bare-JSON parse failure; extractive mismatch also present | 3.92s | input 32, cache-read 2432, output 365 |

The original schema requested full corpus IDs while the prompt supplied short
`E1`…`E8` handles. The web schema now enumerates only offered handles, then
resolves them before the original contract gate. A diagnostic raw completion
confirmed correct handles but included Markdown code fences; inside it, an
extractive comparison cell changed the source sentence's punctuation. This is
not verbatim extraction. Both defects remain rejected by regression tests. The
sanitized raw diagnostic is checked in at
[`fixtures/live-model-failure-v2.json`](../apps/web/fixtures/live-model-failure-v2.json).

`live-cards-3` added a bare-JSON and exact-extraction instruction. Two real
positive checks still failed card validation (5.33s, input 1146 / cache-read 1408
/ output 489 tokens; and 4.78s, input 1338 / cache-read 1408 / output 273 tokens). A further recorded diagnostic (4.27s, input 122 / cache-read 2432 / output 367
tokens, also 422) proved that the model still marked rewritten comparison questions as `extractive`, despite that
instruction. These attempts were not counted as successful answers.

`live-cards-4` keeps the same model, one-call policy, evidence and shared planner
prefix. A web-only suffix requires bare JSON; the request schema and web policy
restrict generated text to `summarized` or `inferred`. Original passages are
rendered directly from corpus data. Returned `extractive` fields are rejected,
never relabeled. It does not strip fences, change citations, repair output or
weaken the shared gate. [Delivery configuration](WEB-REVIEW.md) records the complete
web-specific settings separately from the unchanged F5 configuration.

The Chinese dessert negative (“怎样制作焦糖布丁？”) returned `incomplete`, zero
sources and null usage in every local smoke iteration, in under 1ms of server
work (about 1–2ms including the local request wrapper). It skipped generation.
This is one zero-hit example, not a calibrated out-of-domain rejection rate.

## Final configuration: actual model checks

The final `live-cards-4` checks completed with unmodified real outputs. The full
responses, source passages, actual BM25 scores, note URLs and timing breakdowns
are saved in [the public smoke record](live-card-smoke-2026-10-22.json).

| Submitted question | Result | Handler time | Input / cache-read / output tokens |
| --- | --- | ---: | --- |
| How does sparse retrieval differ from dense retrieval? | complete, 1 comparison card, 8 retrieved passages | 4.88s | 2576 / 0 / 395 |
| 为什么重排不能提高召回率？ | complete, 1 mechanism card, 8 retrieved passages | 4.13s | 2128 / 640 / 263 |
| 怎样制作焦糖布丁？ | incomplete, no cards, no retrieved passage, no model call | 0.72ms | unavailable because no generation |

Manual semantic review: the comparison's vocabulary/inverted-index and
learned-space/proximity descriptions match the sparse and dense source notes.
The “exact terminology” weakness is a statement from this project's corpus
note, not proof about every dense retriever or dataset. The Chinese mechanism
correctly says reranking reorders an existing candidate set, cannot recover an
absent passage, and preserves Recall@K **when K equals the candidate count**.
That qualifier matters: recall at a smaller downstream cutoff can change after
reranking. Citations resolve to passages from the actual request.

## Scope of timing and charges

Times above are wall-clock handler observations including retrieval, model wait
and validation, on one development machine. Network/cache load and provider
scheduling vary. They are not medians or a latency benchmark. Cache-read token
counts are reported separately rather than silently added to the SDK's input
field. The model's billing account was not queried; **actual charged currency is
unavailable**. These paid calls must not be reported as free. The timed-out call
may have incurred usage despite returning no usage record. No fee is inferred
from a missing usage value.

No prompt, profile, corpus or protocol under the shared generation package or
F5 evaluation paths was changed. The independent image experiment retains its
original seals and measured outputs. No LLaVA call or integration was added.

## Publication record

Cloudflare deployed `rgux-web` version
`75eb4816-1a95-45a3-9402-cdb7e262f525` on 2026-10-22 from this review branch.
The [full live app](https://rgux-web.yuki-uix.workers.dev/ask) serves the question
form and API. `/api/health` reports the key binding configured, `lexical-bm25`
and `corpus-3e4863076378` without exposing credentials. This capability probe
alone does not establish successful model generation.

GitHub repository variable `LIVE_CARDS_ENDPOINT` is the public
`https://rgux-web.yuki-uix.workers.dev/api/cards` URL; the Pages workflow compiles
it into the same question component. Only the API URL is public, never the key.

Production browser check: submitting the Chinese reranking question through
Cloudflare `/ask` returned a fresh four-stage mechanism card with eight real
retrieved passages in 4.62s. Clicking a field citation opened those passages;
“Open source” pointed to the exact pinned corpus note. This was a separate paid
request from the local smoke, not a replay. The generated “will improve nDCG”
phrasing follows the corpus note's simplification; it should not be treated as
a guarantee that any reranker improves ordering. The smaller-cutoff/whole-set
recall distinction remains visible in the card's third stage.

Production probes confirmed GitHub-origin preflight succeeds with exact-origin
CORS headers and the retired `/api/ask` returns 410 without generation. Local
validation passes 503 tests, workspace typechecks, web lint, schema freshness,
static and Worker bundle scans. GitHub CI and Pages publication are separate
checks linked from PR #92.
