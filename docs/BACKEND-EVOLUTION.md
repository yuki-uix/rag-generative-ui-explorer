# Backend evolution path

This document describes how the MVP could grow into a durable Agent-backed
application without turning the current experiment into a general-purpose
Agent platform prematurely.

The proposal is intentionally documentation-only. It records boundaries,
invariants, and milestones before adding a database, queue, or worker.

## Current boundary

The MVP is a request-scoped knowledge explorer. The web route retrieves evidence,
generates a validated response, and streams the result to the browser. Corpus
ingestion and embedding are offline workflows; query-time retrieval currently
uses an in-process index.

```text
Browser
   |
   v
apps/web /api/ask
   |
   +-> in-process Retriever
   |
   +-> packages/generation
          |
          +-> validate cards and evidence references
   |
   v
NDJSON response
```

This boundary is appropriate for the MVP because the experiment asks whether
dynamic knowledge-card selection improves understanding. It does not yet need
durable jobs, accounts, cross-device history, or a long-running worker merely
to answer one question.

## Why the runtime should evolve separately

The current product has a clear synchronous query path and a thin web shell.
Long-running work has a different lifecycle:

- a request may return before the Agent finishes;
- a worker may restart between two steps;
- a queue may deliver the same task more than once;
- a user may poll or reconnect after losing the browser connection;
- shutdown must drain or checkpoint in-flight work.

Those are runtime concerns, not card-rendering concerns. The existing contracts,
corpus, retrieval, and generation packages should remain usable without a
worker. A future runtime should call them through explicit interfaces rather
than making React components or Cloudflare request handlers own task state.

## Future durable run boundary

The first useful extension is an asynchronous `run`, not a general-purpose
Agent platform. A run represents one question and its evidence-grounded answer
attempt.

```text
Browser
   |
   | POST /api/runs (Idempotency-Key)
   v
API ingress
   |
   | transaction: create run + append outbox event
   v
PostgreSQL  <---- status/result reads ----  API ingress
   |
   | publish after commit
   v
Queue
   |
   v
Agent worker
   |
   +-> retrieve evidence
   +-> checkpoint
   +-> generate cards
   +-> validate evidence references
   +-> checkpoint final result
   |
   v
PostgreSQL
```

The current `/api/ask` path can remain synchronous while `/api/runs` is
introduced for work that benefits from recovery, polling, or evaluation. The
browser should not need to know whether retrieval is BM25, dense, or backed by
PostgreSQL; that choice stays behind the `Retriever` seam.

## Proposed runtime state

The state machine should be explicit before it is persisted:

| State | Meaning | Allowed next states |
| --- | --- | --- |
| `queued` | Accepted and waiting for a worker | `running`, `cancelled` |
| `running` | A worker owns the current attempt | `running`, `succeeded`, `failed`, `cancelled` |
| `retry_wait` | Failed with a retryable error | `queued`, `failed`, `cancelled` |
| `succeeded` | Validated response is available | terminal |
| `failed` | Retry policy is exhausted or the error is permanent | terminal |
| `cancelled` | Cancellation was accepted before completion | terminal |

Every transition should have a reason and an attempt number. A boolean such as
`is_done` is not enough to distinguish a clean completion, a retryable failure,
and a result that is incomplete because a dependency timed out.

## Backend invariants

The future runtime should make these properties testable:

| Invariant | Design consequence |
| --- | --- |
| One client intent creates one run | Use an idempotency key with a database uniqueness constraint. Do not rely on a preceding existence check. |
| A committed run is eventually publishable | Write the run and an outbox event in one transaction; publish only after commit. |
| A worker crash does not lose progress | Persist a checkpoint after each meaningful step and reclaim expired leases. |
| A retry does not duplicate effects | Give each step an idempotency key and make result writes conditional on the attempt/version. |
| An incomplete answer is not a successful answer | Preserve `incomplete`, timeout, and insufficient-evidence reasons in the response contract. |
| Shutdown does not abandon owned work silently | Stop accepting work, drain active runs until a deadline, then checkpoint or requeue them. |
| A slow dependency cannot consume all capacity | Apply per-step deadlines, bounded queueing, and worker admission limits. |
| Evidence remains trustworthy | Validate evidence IDs at the server boundary; never let the model create arbitrary citations. |
| Diagnostics do not become a second data leak | Keep prompts, raw provider payloads, and sensitive evidence out of logs and metrics by default. |

These invariants connect directly to the failure modes studied in the backend
curriculum: cache invalidation, transaction boundaries, task queues, detached
request resources, idempotency, graceful shutdown, trust boundaries, and
timeouts.

## Suggested milestones

### M5 — Durable run contract

Keep the implementation small and use a fake worker first.

- Define `Run`, `RunStep`, and status-transition contracts.
- Add `POST /api/runs` and `GET /api/runs/:id`.
- Enforce `Idempotency-Key` at the storage boundary.
- Persist a final validated `KnowledgeUIResponse`.
- Test duplicate submission and illegal transitions.

### M6 — Reliable worker execution

- Add a separate worker process rather than running long work inside the web
  request.
- Add a queue and a bounded retry policy.
- Add checkpoints after retrieval, generation, and validation.
- Make result publication and step completion idempotent.
- Add lease expiry and recovery tests.

### M7 — Failure and lifecycle behavior

- Propagate request and step deadlines to retriever and provider calls.
- Represent timeout and insufficient evidence separately.
- Stop intake before shutdown and drain active workers.
- Requeue or checkpoint work that cannot finish before the drain deadline.
- Add load tests for queue saturation and concurrent duplicate requests.

### M8 — Evaluation and operations

- Store a versioned run manifest containing model, prompt, corpus, and index
  versions.
- Reuse the existing evaluation protocol for answer and card comparisons.
- Add metrics for queue wait, step latency, retries, incomplete runs, and
  validation failures.
- Add traces that identify the slow stage without recording raw evidence.

## Deliberate technology decisions

The implementation should not choose infrastructure before the state and
failure semantics are tested. PostgreSQL is a natural first durable store
because it can provide uniqueness constraints, transactions, and an outbox.
A Redis-backed queue or a PostgreSQL-backed queue can be evaluated later; the
worker should depend on a queue interface rather than on a provider-specific
API.

The web application may run in an edge environment, while a durable worker is
normally a separate long-lived process. Keeping those roles separate avoids
assuming that an edge request handler can own a multi-minute Agent execution.

Authentication, organizations, billing, and production multi-tenancy remain
separate decisions. They should not be smuggled into M5 merely because a
durable run table exists.

## Explicit non-goals

This path does not propose:

- a general-purpose Agent orchestration framework;
- arbitrary user-defined tools or executable UI code;
- autonomous corpus modification;
- cross-tenant data sharing;
- event sourcing for every UI interaction;
- a distributed consensus system;
- replacing the current synchronous MVP query path.

The first future milestone is successful when a run can be submitted twice
without duplication, survive a worker restart, and return a validated or
explicitly incomplete response. It is not successful merely because a queue
and a database have been added.
