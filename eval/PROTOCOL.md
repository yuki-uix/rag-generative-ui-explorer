# Evaluation protocol

**Version 2, 2026-08-30** (see “The model is a variable” below; version 1 was written 2026-08-29). The API facts below were checked against
Anthropic's model documentation on that date. They are properties of a specific
model at a specific time and will go stale without warning — the sampling
parameters this protocol reports as absent existed on earlier models. Re-check
them when the pinned model changes, and bump this version when any pinned
variable or classification changes.

What every evaluation run must pin, record, and report. The MVP exit criteria in
[MVP](../docs/MVP.md) reference this file; a number produced outside these rules
is not comparable to one produced inside them and should be discarded rather
than caveated.

## The pinned variables

Every run records all of these. A comparison whose arms disagree on any of them
is not a comparison, and the harness refuses to run rather than reporting one.

| Variable | Value | Recorded from |
| --- | --- | --- |
| Model profile | a named profile — see below | run config |
| Model ID | the profile's exact string | request |
| Endpoint | the profile's base URL | request |
| Effort | `output_config.effort`, where the profile supports it | request |
| Thinking | `{ type: "adaptive" }`, where the profile supports it | request |
| `max_tokens` | pinned per arm, streamed | request |
| Prompt version | a string bumped on any prompt edit | application |
| Corpus version | `corpus-<hash>` from the manifest | `knowledge/manifest.json` |
| Chunking parameters | boundary and size cap | manifest `chunking` |
| Question set | `eval/questions.jsonl` and its header | file |
| Repetitions | 3 per question per arm | run config |

Model IDs are exact strings and carry no date suffix.

## The model is a variable, not a constant

**Version 2, 2026-08-30.** Version 1 pinned `claude-opus-5` as though it were a
property of the protocol. It is a choice, and writing it into every request made
the choice expensive to revisit later while nothing yet depended on it.

A run names a **model profile**: an endpoint, a model ID, and which optional
request parameters that endpoint accepts. The parameters below are not universal
— `output_config.effort` and `thinking` belong to Anthropic's API, and a profile
pointing at another endpoint omits them rather than sending fields it will
reject. The profile is a pinned variable like any other: recorded with every
result, and a comparison whose arms disagree on it is not a comparison.

**The first profile used is not `claude-opus-5`.** M1 runs against DeepSeek
through its Anthropic-compatible endpoint, because the pipeline can be built and
its grounding gates exercised on any model, and doing so costs nothing to switch
away from later. The rule from the comparability section applies with full force
here: **changing the profile starts a new baseline.** No result produced under
one profile is carried forward to another, and the M4 comparison in particular
must be produced entirely under a single profile.

What this does not license is comparing a card arm on one profile against a
Markdown arm on another. The profile is pinned per *run*, not per arm.

The sampling facts in the next section were checked against `claude-opus-5` and
are properties of that profile. Another profile has its own, which have to be
checked rather than assumed to match.

## There is no temperature to pin

This is the part that would have been written wrong from memory, so it is stated
first.

**`temperature`, `top_p`, and `top_k` are removed on `claude-opus-5`.** Sending
any of them returns HTTP 400.

No determinism control appears anywhere in the documented request surface for
this model — not a sampling parameter, not a seed. That is a statement about
what the documentation covers, not a proof that no such parameter exists
anywhere; but nothing available to this harness makes generation repeatable, so
the protocol is built on the assumption that it cannot be.

The lever that exists instead is `output_config.effort`, which takes `low`,
`medium`, `high` (the default), `xhigh`, and `max`. It trades thoroughness
against token spend within one model. It is a pinned variable like any other,
and it is not a determinism control — two runs at the same effort still differ.

Two consequences follow, and they shape everything below:

1. **Run-to-run variance is irreducible.** It cannot be configured away, so it
   has to be measured. This is why repetitions are mandatory rather than
   advisable.
2. **A single run of a model-dependent metric is a sample, not a measurement.**
   Reporting one without dispersion overstates what is known, which is the
   failure this whole project argues against.

`budget_tokens` is also removed on this model. Assistant prefill returns 400.
Neither belongs in a request the harness builds.

## Repetitions and dispersion

**Three repetitions per question per arm.** Report the median and the full range
for every model-dependent metric, never the mean alone — with n=3 a mean hides
a bimodal split, which is exactly the shape a card-selection disagreement takes.

Where a range spans more than a few points on a rate metric, that is the finding.
Add samples before adjusting anything; tuning against a spread that has not been
characterised is how a random walk gets mistaken for progress.

Per-cell results — domain crossed with card type — sit at roughly a dozen
questions each. **A per-cell result supports a direction at best**, and the n
must be printed next to it every time.

## Which metrics may be concluded from one run

Every metric in [MVP](../docs/MVP.md) is classified. Mechanical metrics are
properties of an artefact and are determinate from a single run. Model-dependent
metrics vary between runs and require repetitions with dispersion. Human metrics
need people and carry their own small-n caveat.

### Retrieval and grounding

| Metric | Class | Why |
| --- | --- | --- |
| Retrieval Recall@10 | **Mechanical only while the pipeline has no model in it** | Lexical, dense, and fusion are all deterministic given a fixed corpus, index, and query. **Two in-scope features move it:** query rewriting puts a model before retrieval, and reranking selects which 10 of the candidates are counted — reranking cannot change recall over the *candidate set*, but Recall@**10** is a smaller K, so it changes which documents fall inside it. With either enabled this is model-dependent and needs repetitions, and it is the gate metric, so misclassifying it costs the most. |
| Citation precision | **Model-dependent** | Which passages the model cites varies per run. |
| Citation completeness at field level | **Schema invariant, not a metric** | A factual field without a reference fails validation and never renders, so among rendered responses this is 100% by construction. Worth stating as an exit criterion because it is binary and checkable; worth *not* reporting as a measurement, because a number that is always 1.0 tells a reader nothing. |
| Unsupported-claim rate | **Model-dependent** | Requires judging whether a passage supports a claim. |
| Insufficient-evidence detection accuracy | **Model-dependent** | Scored against the `expectInsufficient` labels; the decision is the model's. |

### Generative UI

| Metric | Class | Why |
| --- | --- | --- |
| Card-type selection accuracy | **Model-dependent** | The selection is the thing under test. Scored against the acceptable-type sets in the question file. |
| Unnecessary-card rate | **Model-dependent** | Requires judging whether a card earned its place. |
| Invalid-card-spec rate, pre-repair | **Mechanical** per response, **model-dependent** in aggregate | Whether one response validates is determinate; what fraction do is a distribution. **The exit criterion is a rate, so it needs repetitions.** |
| Invalid-card-spec rate, post-repair | Same | Recorded separately. A pipeline that repairs quietly looks healthier than it is. |
| Time to first useful content | **Model-dependent** | Latency varies per run; report median and range. |
| Time to locate a requested fact | **Human** | Needs participants. |
| Source-open and follow-up interaction rates | **Human** | Needs participants. |
| Card-state preservation across turns | **Mechanical** | A property of the implementation, not of a generation. |

### Exit criteria

| Criterion | Class |
| --- | --- |
| At least 60 manually reviewed questions | **Mechanical** — the file has 60 or it does not |
| At least 90% valid card specs without a second model call | **Model-dependent** — a rate, needs repetitions |
| 100% of rendered factual fields reference valid retrieved evidence IDs | **Mechanical** |
| Zero executable model-generated code rendered | **Mechanical** — binary, testable |
| A repeatable comparison of the three modes | **Mechanical** — the harness runs or it does not |
| Documented findings including where dynamic cards perform worse | Neither; a deliverable |

Four of six exit criteria are mechanical and determinate from one run. **That is
deliberate.** Criteria that need statistics to interpret are criteria people
argue about.

## Cost accounting

Report token spend as four separate figures, never one total:

| Figure | Field | Relative cost |
| --- | --- | --- |
| Uncached input | `usage.input_tokens` | full |
| Cache writes | `usage.cache_creation_input_tokens` | ~1.25× |
| Cache reads | `usage.cache_read_input_tokens` | ~0.1× |
| Output | `usage.output_tokens` | ~5× input |

**`output_tokens` may include reasoning the reader never sees.** Measured on the
DeepSeek profile: a response whose visible text was two lines reported 720 output
tokens, and the message carried a `thinking` block alongside the text. Two
consequences. Output spend cannot be attributed to answer length. And time to
first content means time to the first *visible* token — a model that reasons
before it writes has already spent seconds by then, so the streaming advantage
this protocol predicts for the Markdown arm is smaller than a token-by-token
mental model suggests. How much smaller is a measurement nobody has made: the
observations so far are n=3 with a range of 4.0 to 13.8 seconds, which is a
reason to measure rather than a result.

A single "total prompt tokens" figure conflates a cache read with an uncached
token that costs roughly ten times as much. It then usually gets reused as a
proxy for three different things — money, context pressure, and work done —
which it measures differently.

Verification: if `cache_read_input_tokens` is zero across repeated runs with the
same prefix, something is silently invalidating the cache. A timestamp in the
prompt, a varying tool order, or unsorted JSON will each do it. That is a bug in
the harness rather than a property of the workload, and it changes the cost
numbers by roughly an order of magnitude.

Token counts come from `client.messages.countTokens`, never from a third-party
tokeniser. Costs are computed from the published rates for the pinned model at
the time of the run, and the rates used are recorded with the result.

**Measure, do not extrapolate.** Latency and cost at the size that matters, not
projected linearly from a smaller run. Reducing the number of model calls does
not reliably reduce spend — merging two calls into one larger one can raise
total tokens and lose a cached prefix.

## Outcomes that are not failures

Three response outcomes must be recorded as themselves rather than retried into
silence:

- **`stop_reason: "refusal"`.** The model declined; `stop_details.category` says
  why. Retrying blindly turns a recorded outcome into an invisible one.
- **`stop_reason: "max_tokens"`.** The response was truncated. Its metrics are
  not comparable to a complete response and must not be pooled with them.
- **An incomplete response with a reason.** The system saying the corpus cannot
  answer is correct behaviour and is scored against `expectInsufficient`, not
  counted as an error.

## What every run records

Enough to replay it, per the observability requirement in `ARCHITECTURE.md`:

- Query, and the transformation applied to it if any
- Corpus version, chunking parameters, question set header
- Model ID, effort, thinking configuration, `max_tokens`
- Prompt version
- Retrieval candidates with scores; the fused set; the reranked set
- **Raw model output before any repair attempt**
- Validation result per stage, and whether repair ran
- Final response, `stop_reason`, and `stop_details` when present
- `usage` in full — all four token figures
- Wall-clock latency per stage

The pre-repair capture is load-bearing. "Valid without a second model call" is
an exit criterion and cannot be computed from logs that record only the final
state.

**Process exit status is not a health signal.** A run can exit zero having made
no useful call at all — a request can return HTTP 200 carrying an error, and a
harness can report success while every question failed. Success is read from the
recorded payload, never from a return code.

## Comparability rules

1. **Same inputs.** Same question set, same corpus version, same chunking.
2. **Same configuration.** Same model, effort, thinking, `max_tokens`, prompt
   version.
3. **The harness refuses rather than reconciles.** If two arms disagree on a
   pinned variable, it stops. Silently comparing them produces a number that
   looks like a result.
4. **Changing a pinned variable starts a new baseline.** Prior results are not
   carried forward across a model change, a prompt edit, or a re-chunk.

   **This has happened once.** On 2026-08-30 two A2UI notes were added and eight
   existing questions gained golden evidence. The question set is a pinned
   variable, and widening it widens the denominator of every recall figure:
   measured on the same corpus and retrievers, every arm moved by one to three
   points. Nothing about retrieval had changed. Numbers from before that date
   are not carried forward, and `docs/ARCHITECTURE.md` reports only the current
   set — a table carrying two vintages would invite the trend line this rule
   exists to prevent.
5. **Report negative results.** Where an arm loses, that is the finding. A
   comparison that only reports where the new thing won has not tested anything.

## Stated predictions

Recorded in advance so a predictable consequence is not later reported as a
discovery:

- **Dynamic cards should lose on time to first content.** Markdown streams token
  by token; cards render atomically after validation. The argument has to be won
  on time to locate a fact instead, and if it is not won there, the trade was
  wrong.
- **Dynamic cards should at best match Markdown on accessibility.** Well-formed
  prose is strongly accessible by default.
- **Dynamic cards will lose on consistency**, by construction.

Each is a prediction of direction, not of size. Direction is what makes them
falsifiable: a loss in the predicted direction is a design consequence, a loss
in the other direction means the reasoning behind the design was wrong. Where a
result contradicts one of these, say so — a prediction that can absorb any
outcome was not a prediction.

## What this protocol does not establish

It fixes the conditions under which numbers are produced. It says nothing about
whether the labels those numbers are scored against are correct.

The notes, the questions, the golden evidence, and the source attributions were
all written by the same person. Recall@10's denominator is entirely determined
by labels that have never been reviewed by anyone else. Every mechanical check
in this repository establishes that a claim is well-formed and resolves — never
that it is right.
