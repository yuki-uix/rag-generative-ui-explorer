# F2: LangChain against the native baseline

F2 implements [#80](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/80).
The existing application keeps its native SDK path. LangChain is available in
the experiment CLI, using `SystemMessage`, `HumanMessage`, and
`model.withStructuredOutput(schema, { method: 'jsonSchema', includeRaw: true })`.
Retrieval, prompts, handle resolution and the
contract/policy `gate` remain shared.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm framework:compare                       # no key; exercises both adapters
pnpm framework:smoke --implementation native
pnpm framework:smoke --implementation langchain
pnpm framework:compare --live                # DEEPSEEK_API_KEY in environment
```

The comparison retrieves once for `rag-001`, `rag-003`, and `ins-001`, saves
`inputs.json`, and passes those same ordered passages to both adapters. It
permits **six requests total**, with a shared counter at the fetch boundary,
both framework and SDK retries zero, and format repair disabled. `max_tokens`
is 4096. No new retrieval algorithm, loop, or UI was introduced. The committed
config is [comparison.json](comparison.json); explicit env-file usage is in
[README.md](README.md).

## Actual endpoint observation: 2026-10-18

The [complete live record](results/f2-2026-10-18/run.json) pins the model
`deepseek-v4-pro`, endpoint `https://api.deepseek.com/anthropic`, prompt
`card-planner-1`, corpus and index hashes, question set, schema and dependency
versions. This was a real authenticated six-request run, not fixture output.
All requests returned HTTP 200. No automatic retries or repairs ran.
This endpoint/profile is the one verified by F2; other model profiles remain
unverified with the LangChain adapter.

| Sample (one attempt per arm) | Native | LangChain | Native / LangChain generation time | Output tokens, native / LangChain |
| --- | --- | --- | --- | --- |
| `rag-001`, definition | valid | valid | 25.53 / 28.81 s | 2153 / 2682 |
| `rag-003`, comparison | truncated | valid | 43.21 / 38.38 s | 4096 / 3725 |
| `ins-001`, absent evidence | incomplete, missing | incomplete, missing | 3.67 / 2.35 s | 116 / 137 |

The native comparison stopped at `max_tokens`; its raw partial output is
preserved and no validated result was created. The CLI exited 1 after saving
all six records, correctly reporting the failed sample. The LangChain answers
passed the common schema, citation and extractive-policy checks. Those checks
do not judge every summarized claim's factual correctness.

The [summary](results/f2-2026-10-18/summary.json) reports matching evidence,
prompt text, model ID, token cap and streaming settings for every pair. The
actual serialized request bodies differ only at `output_config`: native omits
it for the unenforced DeepSeek profile; LangChain adds a transformed JSON Schema.
No tool-call wrapper or extra prompt was added. The
[records](results/f2-2026-10-18/records.jsonl) preserve every request body, raw
completion, framework parsing observation, usage and validation result; the
[fixed inputs](results/f2-2026-10-18/inputs.json) can be inspected separately.
Headers, keys and URL queries are excluded. These four files are the original
artifacts, not regenerated results. This one representative run is committed;
other invocations remain under ignored `runs/` to bound repository growth.
The run was made from the recorded base commit plus a dirty working tree; its
fingerprint is retained in the header. Later documentation/test edits do not
rewrite that historical code version.

**This is compatibility evidence, not an effectiveness result.** There are only
three questions, one attempt each. The native arm ran first and the LangChain
arm benefited from warmer provider caches: for `rag-001`, native reported 2781
uncached input tokens and no cache reads, versus 93 uncached and 2688 cached
for LangChain. Four token counts are retained separately, and the adapter
converts LangChain's cache-inclusive input total back to native accounting.
No monetary saving or speed advantage can be inferred. SDK versions also differ.
The existing [evaluation protocol](../PROTOCOL.md) requires the full question
set and repetitions before outcome-rate conclusions.

## What is constrained, parsed, and validated

| Layer | What this implementation records |
| --- | --- |
| Prompt | Both arms receive the identical original prompt/schema text; the DeepSeek profile puts the schema in the prompt |
| Provider | LangChain requests JSON Schema, but `schemaEnforced` remains **false**, from the existing profile; HTTP 200 does not prove enforcement |
| Framework | `includeRaw: true` retains the original AI message. With a plain JSON Schema, this version uses `JsonOutputParser`, not Zod validation. `parserSucceeded` and `schemaValidated: false` are recorded separately |
| Business contract | The original raw text goes through strict JSON parsing, envelope checks, handle resolution, `gate`, and `KnowledgeUIResponse`. Framework-parsed output never bypasses these checks |

Malformed JSON, unknown evidence handles (including evidence cards), truncated
output, refusal and provider 503 are exercised through both real adapters using
synthetic transport. Every failure has an explicit outcome and no validated
result. A parser accepting a JSON fragment or a structurally wrong object does
not make it a valid card. There is no `OutputFixingParser`, fallback model, or
format retry. Repair remains the shared follow-up [#25](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/25),
with F1's original/final validity fields preserved.

## The integration failure and fix

The first `withStructuredOutput(..., { method: 'jsonSchema' })` call failed
before sending HTTP:

```text
Error: JSON schema must have a type defined if anyOf/oneOf/allOf are not used
```

The generated planner schema has `incompleteReason: { enum: ['missing',
'conflicting'] }`, valid JSON Schema without an explicit type. The Anthropic
SDK used by LangChain requires that type during its transformation. The adapter
now makes a copy and annotates string enums with `type: 'string'`. A test checks
that the shared source schema was not mutated. The native request and original
prompt remain unchanged.
Local failures before transport are recorded as `adapter-error`, separately
from provider errors; an attempted call beyond the shared budget is
`budget-exceeded` and is blocked before HTTP.

The SDK then transforms the schema further: several enum/const/pattern and size
constraints are represented in descriptions rather than preserved as strict
keywords. That transformed schema is saved in each actual request. It must not
be described as enforcement of the original business contract, which is why
the common gate remains mandatory. During integration we also corrected F1's
stale import of `planner/validate.ts`: main had already moved validation into
`@rgux/contracts.gate` through #71 before F1 merged.

## Framework tradeoff and pinned sources

LangChain replaces the direct SDK streaming call and exposes a common message
interface plus a structured-output runnable that returns raw and parsed values.
It still requires custom code for profile capabilities, schema compatibility,
raw/partial output capture, stop reasons, cache accounting, wire inspection,
budgets, evidence rules and policy checks. F2 therefore keeps native as the
default. The adapter becomes useful for subsequent framework experiments; this
run alone does not justify an application migration.

Pinned versions are `@langchain/anthropic 1.5.12`, `@langchain/core 1.2.18`, its
transitive `@anthropic-ai/sdk 0.122.0`, and native `@anthropic-ai/sdk 0.72.1`.
`pnpm-lock.yaml` locks both SDKs; `run.json` records the resolved versions and
lock hash. The official [ChatAnthropic integration documentation](https://docs.langchain.com/oss/javascript/integrations/chat/anthropic)
describes messages, streaming and structured output; the
[LangChain Anthropic package reference](https://reference.langchain.com/javascript/langchain-anthropic)
documents the integration. The specific transformation/parser behavior above
was verified in the installed, pinned `chat_models`, `structured_output`, and
`transform-json-schema` sources, then exercised in request-capture tests and the
live run, rather than assumed from the general feature list.
