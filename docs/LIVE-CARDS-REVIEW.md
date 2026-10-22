# PR #92 live question review — 2026-10-22

This review checks custom questions, source consistency, insufficient evidence
and failures after the initial deployment. It does not modify or re-evaluate
F5. The first pass retained `live-cards-4` and fixed web response handling.
A later field-level semantic defect led to the separately recorded
`live-cards-5` web suffix below. The shared model profile, planner prefix,
retrieval bundle and technical-term bridge remain unchanged. These selected
checks are not an effectiveness comparison.

## Findings and corrections

| Finding | Reproduction | Correction |
| --- | --- | --- |
| A valid response for a different question can render under the submitted question | Return structurally valid cards with a different `question`; the old client accepts them | Compare returned question with the exact trimmed submission; reject mismatches before rendering |
| Generation failures lose their sources and observed usage | Real HTTP 422/502 responses contain evidence, timing and usage, but the old client throws before parsing the full envelope | Validate full failure envelopes and show their sources/run record with zero cards; retain short rate-limit errors as notices |
| A stalled response body can leave the form waiting indefinitely | Resolve fetch headers but never finish the body; cancellation alone depends on transport behavior | Bound client waiting to 75 seconds across headers and body; abort without retry, preserve stale-response protection and say usage is unknown |
| Empty incomplete responses claim a partial answer is displayed | English dessert query retrieves eight irrelevant passages; model returns zero cards, but the page says it displays supported parts | Distinguish zero-card missing/conflicting responses from actual partial cards, in both server and client |
| Deep model JSON escapes the readable failure path | Roughly 10KB of nested model JSON causes the recursive extraction scan to throw RangeError | Iterative scan with depth 32/node 4096 bounds before recursive handle resolution; reject as 422 with no cards |
| Blank factual text can pass the original min-length contract | A grounded text consisting of whitespace passes the shared gate and is reported complete | Reject blank model strings in the web policy; do not trim/repair the output or change shared contracts |
| Invalid UTF-8 can leave an unread request stream open | Send an invalid first chunk without closing the body; old decoder failure does not cancel the reader | Cancel remaining body on read/decoding failure without waiting on an uncooperative cancel hook |

Additional client checks reject inconsistent source counts, suppress raw server,
HTML and native network error strings, and display uncached input, output,
cache-read and cache-write token fields separately. Unknown provider usage is
not described as a skipped/free call. A zero-hit question with zero generation
time and no usage is explicitly identified as skipping the model.

Regression tests first reproduced the cross-question, HTTP-error, stalled-body,
deep-JSON, blank-text and unread-stream defects. They also cover zero-card
missing/conflicting and actual partial responses. Maximum legal card shapes
remain accepted within the resource budget. The shared contracts gate remains
active. Malformed output is neither repaired nor turned into sample cards.

## Actual production questions before the correction

| Question | Observed behavior | Source/semantic review |
| --- | --- | --- |
| 重排把100个候选截成前5个结果时，Recall@5一定保持不变吗？ | 1 evidence card, 8 retrieved passages, 1.74s; title says Recall@5 is not necessarily unchanged | The reranking passage explicitly limits unchanged recall to K equal to the whole candidate count and discusses a smaller downstream cutoff. The generated conclusion preserves that distinction. |
| How do I make caramel pudding? | 8 irrelevant lexical hits, zero cards, incomplete, 1.49s | The model correctly refuses to invent a recipe despite nonzero retrieval. The old partial-display wording is a UI defect fixed above. |
| What is the current p99 latency of our RAG service? | 8 passages, zero cards, incomplete, 1.235s; 1016 input / 1536 cache-read / 23 output tokens | General latency notes do not supply a measured p99 for this service. No number was invented. |
| 怎样制作焦糖布丁？ | Zero passages, zero cards, incomplete; no model call, null usage | Correct zero-hit path; this differs from the English question's irrelevant lexical hits. |

The p99 and zero-hit HTTP responses are saved in
[the review record](live-card-review-2026-10-22.json). The first two observations
were made through the actual GitHub Pages form, not by replaying a saved answer.
These are selected, small integration checks, not a refusal-rate estimate or a
blind holdout. Source-based semantic checks were performed by AI assistants in
the implementation team, not independent human adjudicators.

## Further production checks and semantic correction

On the first patched deployment (`live-cards-4`, app commit `ad4edca`):

- Repeating the English dessert question returned zero cards and eight passages
  in 1.47s. The page now says “本次未生成知识卡”, with no partial-answer claim.
- The Chinese zero-hit question returned zero cards, zero passages and the
  explicit “未调用模型” notice.
- “稀疏检索和稠密检索如何匹配文档？” produced a real HTTP 422 in 3.95s. The
  page displayed zero cards but retained all eight sources and input 1118 /
  cache-read 1536 / output 355 tokens. No raw completion was captured for this
  request, so the exact validation stage is unknown; this is not evidence that
  the answer's facts were wrong. No output was substituted or silently retried.
- “稀疏检索是什么？” generated a definition card in 3.87s (input 1117 /
  cache-read 1536 / output 294). Four factual fields were supported. One field
  said “与稠密检索的失败方式不同，因此实际系统常同时运行两者并融合结果。” while
  citing only `rag/sparse-retrieval#what-this-means-here#0-179d75b3`.

That last source gives an **argument for** running and fusing both retrievers;
it does not establish actual practice frequency. This is an observed semantic
failure despite valid structure and citation IDs. The unchanged rendered field,
its actual cited passage and review are preserved in
[the v4 field observation](../apps/web/fixtures/live-semantic-overreach-v4.json),
not misrepresented as a captured raw completion.

`live-cards-5` adds web-only instructions to preserve source scope, qualifiers,
recommendation versus established fact, and field-specific citation support.
A rationale must not become a claim of widespread adoption, a universal
benefit or a measurement. This applies to titles and labels too. The output is
not rewritten, relabeled or accepted through a weaker gate. A prompt constraint
is not an entailment verifier: an unsupported summary can still pass the
mechanical gate, so semantic review remains necessary.

## Failure validation without an online outage

A local static build is connected to an isolated HTTP fixture that uses the
actual BM25 handler and planner SDK but injects a synthetic provider 503. It
uses a fake test key, makes no network model call and changes no production
credentials. The handler returns its real sanitized 502 envelope. The compiled page was verified in the browser: it showed HTTP 502, zero
cards and eight real retrieved passages. Expanding the run record showed
“服务未返回用量，不能据此判断为零消耗。” and the pinned corpus-note links. It must not be reported as a naturally occurring
production model outage or a successful generated answer.

Paid production calls above have observed token usage where available, but the
billing account was not queried. Actual charged currency remains unavailable;
null/unknown usage is not evidence of zero cost. The zero-hit path is the one
that demonstrably skips generation.

F5's knowledge, generation package, prompts, profiles, protocol and artifacts,
as well as its separate worktree, remain unchanged. No LLaVA is added. PR #92
remains open and unmerged.

## Validation and publication

All 523 local tests pass, including 58 API and 16 live-form tests. Workspace
and web typechecks, web lint, planner schema/projection freshness checks,
static production build and both bundle scans pass. The production output
contains no endpoint from the isolated failure fixture.

The first response-handling correction (`live-cards-4`) deployed Cloudflare
Worker version `63c05bed-17bd-4c85-83b5-4f1c4776d17b` from this review branch.
The subsequent v5 deployment version is recorded in PR #92. GitHub Pages uses the existing production endpoint variable and
publishes from the PR branch. The latest CI and Pages runs are linked in PR #92.

The generation revision is recorded as metadata; a compatible previous revision
is accepted after rechecking the same card, evidence and submitted-question
contracts. A malformed revision is refused. Model-prompt revision does not
serve as a substitute for card-format validation.

## v5 actual model check after the semantic correction

Two additional real local-handler calls preserve their unmodified raw model
text, actual response sources, token usage and request-setting/prompt digests in
[the v5 smoke record](live-card-v5-smoke-2026-10-22.json). Both full raw captures
completed; requests themselves are retained locally without headers or keys.

| Question | Result | Handler time | Input / cache-read / output tokens |
| --- | --- | ---: | --- |
| 稀疏检索是什么？ | complete, definition + comparison, 8 passages | 5.80s | 2171 / 640 / 549 |
| 重排会改变只保留前5条时的召回率吗？请区分10个候选的整体召回率与前5条的召回率。 | complete, comparison, 8 passages | 5.27s | 1603 / 1408 / 333 |

The revised definition does not claim actual adoption frequency. Its definition,
vector representation, inverted-index matching and BM25 description are grounded
in the sparse body passage; comparison cells cite the corresponding sparse or
dense body passage. The reranking card separates the complete candidate set
from the smaller top-five cutoff, without inventing a measured gain or a
numerical recall value. These selected results do not establish that the v5
prompt eliminates unsupported claims. The first response also adds a comparison
card to a definition question; minimum-card selection is not guaranteed.

The v5 semantic recheck covered 14 factual fields in these two responses. Minor
wording limits remain: the first response says “大多数人” where its source says
“most systems”; the recall cell relies on its “whole candidate set” column
heading rather than repeating K=10 in the cell itself. Neither sample proves
that the mechanical gate detects unsupported summaries.
