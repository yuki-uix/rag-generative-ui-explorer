# Framework experiments

F1 of the [framework practice route (#84)](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/84).
The runnable baseline addresses [#79](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/79).
F2 adds a LangChain adapter and paired comparison for
[#80](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/80).

## Run the paired comparison

```bash
pnpm framework:compare                    # both real adapters, synthetic transport
pnpm framework:smoke --implementation langchain
pnpm framework:compare --scenario invalid-reference  # intentionally exits 1
pnpm framework:compare --live             # explicit live run; needs DEEPSEEK_API_KEY
```

The comparison config budgets **six requests total**, across three questions and
two arms, with no network retries or format repair. It retrieves once and saves
the fixed questions and ordered evidence to `inputs.json` before either model
call. Both arms receive that snapshot, the same original schema and prompts,
profile, token cap and common `gate`. `summary.json` includes paired outcomes,
usage, generation timings and actual serialized request-body differences;
prompt text, evidence and model settings must agree or the comparison fails.
Request records omit HTTP headers, URL credentials and query strings.

For an ignored `.env.local` file, load it explicitly without copying its values
into a command or another checkout:

```bash
pnpm --filter @rgux/generation exec node --env-file=/absolute/path/.env.local \
  --import tsx scripts/experiment.ts --config eval/framework/comparison.json --live
```

`--implementation native` and `--implementation langchain` select single arms.
`--implementation both` requires enough budget in the selected config (the F1
default budgets three calls, so it refuses both arms). Only the compare config
budgets six by default. The native SDK is retained as the application default;
LangChain lives only in the experiment adapter. See [F2-LANGCHAIN.md](F2-LANGCHAIN.md)
for locked versions, schema/parser distinctions, an actual compatibility failure
and real endpoint observations.

## Run the native baseline

From the repository root, after `pnpm install --frozen-lockfile`:

```bash
pnpm framework:smoke
pnpm framework:smoke --implementation native
```

No key, HTTP request, embedding download, or database is needed. The CLI ingests
the actual corpus, builds the existing BM25 retriever, selects three questions
from `eval/questions.jsonl`, calls `planCards` through the **real Anthropic SDK**,
resolves handles, and calls `gate` and `KnowledgeUIResponse.safeParse`.
Only the provider's SSE response is synthetic. Even if a key is present, smoke
mode uses a dummy key and an injected fetch implementation with no network path.

The selected questions in [config.json](config.json) cover a definition
(`rag-001`), a comparison (`rag-003`), and insufficient evidence (`ins-001`). The
fixtures quote retrieved excerpts to exercise validation; they do not establish
that the model answered a question correctly. Fixture usage is synthetic and
local timings measure plumbing, not model latency. There are no framework or
answer-quality conclusions from this run.

To explicitly make real model calls:

```bash
# Supply DEEPSEEK_API_KEY through your environment, then:
pnpm framework:live
```

The CLI prints the sample count and request budget before making calls. The
committed config allows three model requests, one per question, with SDK retries
set to **0**, a 60-second per-request timeout, and `max_tokens: 4096`. It never
repairs or repeats a failed answer. Editing the config starts a new baseline.
Unknown arguments, unknown question IDs, duplicate question IDs, a corpus/label
version mismatch, and a sample count exceeding the budget fail before model use.
Missing credentials fail without creating a run. Live mode cannot use failure
fixtures. Profile capabilities come from the existing repository profiles; F1
does not independently certify that a provider still supports that profile.

## Inspect the output

Each invocation creates a new timestamp-plus-UUID directory under
`eval/framework/runs/`, which is ignored by Git. Use `--out /absolute/directory`
to choose a parent directory. Previous runs are never overwritten.

| File | Contents |
| --- | --- |
| `run.json` | Mode, scenario, config, planned requests, code commit and working-tree fingerprint, Node/SDK/lock versions, corpus/index and question hashes, retrieval parameters, profile/endpoint/request extras, prompt version and schema hash |
| `inputs.json` | Fixed questions and evidence shared by both arms; SHA-256 is in `run.json` |
| `records.jsonl` | One record per completed question: input and labels, retrieved evidence with IDs/text/scores, raw completion, attempts and usage, original/final validity, failures, validated result, stop reason, outcome, per-stage timing |
| `summary.json` | Completion time, actual requests, failed count, and per-question outcome |

`records.jsonl` is appended after every question. If execution is interrupted,
the completed records survive; an absent `summary.json` means the invocation did
not finish. A provider error has no completed attempt; its raw field is `null`
unless visible text arrived before the stream failed. Its error record contains
only the exception name and HTTP status, avoiding credential-bearing request
objects and provider error messages. API keys are never part of the config.

Usage fields a completed response did not supply are **`null`**, never invented
zeros. A reported zero remains zero. No monetary cost is calculated. Refusals,
truncation, other non-`end_turn` stops, malformed output, and invalid evidence
produce separate outcomes and no validated result; any such record makes the CLI
exit nonzero after saving the run. A legitimate incomplete answer is successful.

`validation.originalValid` and `validation.finalValid` describe the unrepaired
output in F1; `repairAttempted` is always false, matching the pinned
`repair: "disabled"`. The common constrained repair behavior remains
[#25](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/25). When it is
added, preserve the original attempt, add the repaired attempt separately, and
reserve both requests in the budget. A repair must not retroactively make the
original output valid.

## Reproduce a failure

```bash
pnpm framework:smoke --scenario malformed
pnpm framework:smoke --scenario invalid-reference
pnpm framework:smoke --scenario provider-error
pnpm framework:smoke --scenario truncated
pnpm framework:smoke --scenario refusal
```

These commands intentionally exit 1 and save the diagnostics. An invalid handle
such as `E999` remains in the raw completion and yields an `evidence-reference`
failure with `result: null`. It is never replaced by a plausible corpus ID or
repaired. See [EXECUTION.md](EXECUTION.md) for an observed run and debugging case.

## Where the framework goes

```mermaid
flowchart LR
  Q["已有：固定问题与语料"] --> R["已有：Retriever"]
  R --> A["F1 已实现：实验适配接口"]
  A --> N["已有：原生 planCards"]
  A --> L["F2 已实现：LangChain"]
  R --> G["F3 已实现：LangGraph 有界补查"]
  N --> V["已有：契约与证据校验"]
  L --> V
  G --> L
  V --> O["F1 已实现：执行记录"]
```

[`ExperimentAdapter`](../../packages/generation/src/experiment/run.ts) has only
an ID and a `plan(PlanOptions)` method. The native adapter calls the existing
[`planCards`](../../packages/generation/src/planner/plan.ts); retrieval and
validation stay outside it. The CLI accepts `native`, `langchain`, `both`, or
`langgraph`. The graph owns its adaptive retrieval and delegates final generation
to the shared LangChain runner; it is not a single-plan adapter. This is a
small seam, not a plugin registry, and introduces no framework dependency into
Evidence, card contracts, or React components. It uses the shared `gate` from
`@rgux/contracts`, following the merged output-gate PR
[#71](https://github.com/yuki-uix/rag-generative-ui-explorer/pull/71).
CLI results do not enter the web renderer.

Native SDK remains the default until a comparison justifies changing it. It
currently needs one generation call and ordinary TypeScript control flow;
the LangChain adapter is an alternative implementation for experiments.

## Run the bounded graph

```bash
pnpm framework:graph
pnpm framework:graph --live  # explicit provider calls; maximum 12 attempts
```

F3 adds a separate strategy experiment: initial retrieval, structured coverage
check, at most one query rewrite and supplemental retrieval, then generation
or an explicit incomplete/error result. The offline command exercises three
paths with controlled omissions and synthetic model replies. It requires no
key or network. See [F3-LANGGRAPH.md](F3-LANGGRAPH.md) for implemented boundaries,
complete execution and failure traces, budgets, and limitations.

Graph `inputs.json` contains the selected questions, with adaptive evidence
saved in each record's snapshots; `fixedInputsSha256` is `null`. Graph records
contain all control and generation calls, offered evidence IDs, tool/model
counts, node timings and stop reasons. No F2 paired-comparison score is emitted.
A graph error returns no result; insufficient or conflicting evidence uses the
existing incomplete response contract.

## Three-arm pilot report

```bash
pnpm framework:study
pnpm framework:study --live  # explicit pilot; maximum 18 model attempts
```

The F5 runner executes native, LangChain and bounded LangGraph with frozen
questions and a matched final context cap, preserving fixed-input pairs and
separate strategy comparisons. Each unique run saves raw records, a JSON summary
and a readable report. The default uses real retrieval and synthetic model
responses; it is integration evidence. See [F5-FINDINGS.md](F5-FINDINGS.md) for
the frozen strategy protocol, representative reports, failure/no-gain examples,
full repeated-run command, and remaining live/semantic/cost work. F5 remains open.

The [repeated live pilot](F5-LIVE-PILOT.md) has 27 sample records, 44 paid
requests, explicit single-AI semantic judgments and an observed CNY 0.94 account
deduction. Its config is `study-live-pilot.json` (three exposed questions, three
repetitions, at most 54 requests). `pnpm framework:audit` recomputes the saved
semantic and cost audit offline; use the complete command in the live report.
The full 60-question study and independent semantic assessment remain pending.

## Task status and comparison plan

GitHub issues are the task source of truth. F1–F3 integration is implemented; full effectiveness evaluation remains open:

| Order | Task | What to hold fixed / inspect |
| --- | --- | --- |
| F2 implemented | [#80 LangChain](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/80) | Same questions, evidence order, prompt, schema, model, endpoint, budget and validator; record actual request differences |
| F3 implemented | [#81 LangGraph](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/81) | Separate strategy experiment: at most one additional retrieval, visible branch and stopping reason; account for the additional calls |
| F5 pilot implemented | [#83 Findings](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/83) | Follow PROTOCOL, include failures, costs, negative results and framework-specific maintenance work |
| Optional F4 | [#82 Checkpoints](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/82) | Resume after restart; explain the boundary with business RunStore, not a prerequisite for F5 |

Before running the full comparison, freeze the arms and follow
[PROTOCOL.md](../PROTOCOL.md): the complete 60-question set, three repetitions,
matching pinned variables and explicit per-arm call budgets. Report validity
before/after any repair, citation failures, insufficient-evidence decisions,
model/request outcomes, latency median and range, and all four available token
counts. Unavailable values stay unavailable. F2 compares implementations on
identical retrieval; F3 intentionally changes retrieval strategy and must be
reported separately. These three-sample integration runs cannot establish
framework benefit or meet the MVP's effectiveness criteria.
