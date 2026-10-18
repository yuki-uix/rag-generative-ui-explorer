# F1 execution and debugging record

Observed on 2026-10-18, on top of main commit `f8788e8`, with the F1 working
changes present. Node `v23.7.0`, pnpm `11.7.0`. The run headers record the exact
working-tree fingerprints and installed SDK/lock hashes. No live model calls
were made.

## Successful integration run

```text
$ pnpm framework:smoke
profile deepseek-v4-pro; max_tokens 4096; timeout 60000ms
rag-001: valid
rag-003: valid
ins-001: incomplete
```

Exit status: 0. Run ID:
`2026-10-18T09-42-27-409Z-f56d7321-a044-4d2a-93b7-7bd6ac7b0292`.

The local `eval/framework/runs/<run-id>/` directory contains `run.json`,
`records.jsonl`, and `summary.json`. These artifacts are intentionally ignored;
rerunning creates a new run rather than overwriting them. The test suite also
invokes the actual CLI twice and verifies that the outputs occupy distinct
directories.

The two answered samples have a validated response; the insufficient sample
has no cards and a `missing` reason. All three preserve their original
completion, resolve references against their own retrieval set, and record no
repair. Missing cache usage is `null`. Token counts in these responses are
synthetic fixture values, not provider measurements.

## Invalid-citation case

```text
$ pnpm framework:smoke --scenario invalid-reference
profile deepseek-v4-pro; max_tokens 4096; timeout 60000ms
rag-001: invalid
rag-003: invalid
ins-001: invalid
```

Exit status: 1, intentionally. Run ID:
`2026-10-18T09-43-58-537Z-ef42dd95-d1cf-40bf-8d61-9051ea1ce123`.

Every record retained the completion containing `E999`; every failure named
`evidence-reference` and `Unknown evidence handles: E999`. `result` was null,
`originalValid` and `finalValid` were false, and `repairAttempted` was false.
The intentionally invalid fixture is also applied to the insufficient sample
to ensure the failure is tested there rather than bypassed by an empty card set.

Diagnosis starts with the recorded stage: this is not malformed JSON or a
provider failure. The planner used a handle it was never shown. The experiment
does not silently substitute another ID or retry the call. Use the raw output
and ordered evidence in that record to reproduce the failure, then fix the
producer of the reference, not the historical artifact.

## A failure encountered while building the CLI

The first implementation used `tsx scripts/experiment.ts`. In this restricted
local environment, the tsx CLI tried to open an IPC socket and failed before
the experiment ran:

```text
Error: listen EPERM: operation not permitted .../tsx-501/...pipe
```

The error occurred in tsx's `createIpcServer`, before ingestion or generation.
The CLI now uses `node --import tsx scripts/experiment.ts`; this loads the same
TypeScript runtime without starting the CLI IPC server. The no-key smoke and
CLI subprocess tests then passed. Existing schema-check scripts hit the same
environment restriction; their unchanged generator was successfully checked
using `pnpm --filter @rgux/contracts exec node --import tsx scripts/build-schemas.ts --check`.

## Checks and scope

The workspace typecheck, all 368 tests, workspace script coverage check, web
lint, production build, and generated schema consistency check passed during this implementation.
The tests include malformed JSON, provider 503 with no retry, invalid references
on ordinary and evidence cards, extractive misattribution, missing incomplete
reasons, truncation, refusal, call budgets, argument errors, and retained run
history.

Request inspection also exposed a request configuration collision:
schema enforcement and effort both use `output_config`, and spreading the
schema after the request extras discarded effort. The planner now preserves
both; a test inspects the actual SDK request body. This is necessary for the
pinned profile extras to describe the request that was sent.

This is an integration baseline. It does not validate model quality, compare
LangChain or LangGraph, implement repair, or claim full evaluation results.
