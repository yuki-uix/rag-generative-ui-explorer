# MVP specification

## Objective

Build a grounded knowledge explorer for two domains—RAG and Generative UI—that
dynamically chooses how to present retrieved knowledge without generating
arbitrary executable UI.

The MVP should answer one question:

> Does dynamic knowledge-card selection help users understand and explore a
> technical topic better than a conventional RAG Markdown answer?

## Primary user flow

1. A user asks a question about RAG, Generative UI, or their intersection.
2. The system classifies or decomposes the question into retrieval intents.
3. Hybrid retrieval returns evidence from the curated corpus.
4. A reranker selects the most relevant evidence.
5. The card planner creates one to four validated knowledge cards.
6. The server verifies every referenced evidence ID.
7. The UI renders the cards and their citations.
8. The user may show sources, request a deeper explanation, or add an entity to
   a comparison.
9. Agent interactions repeat retrieval; presentation-only interactions stay in
   the browser.

## Card types

### Definition

Use for “What is X?” questions. Contains a concise definition and up to five key
points.

### Comparison

Use for differences, alternatives, and tradeoffs. Contains two to four compared
entities and a small set of meaningful dimensions.

### Mechanism

Use for “How does X work?” and “Why does X happen?” questions. Contains ordered
stages or causal relationships.

### Procedure

Use for implementation, migration, evaluation, and troubleshooting instructions.
Contains ordered, evidence-backed steps.

### Evidence

Shows source titles, sections, excerpts, and links. Excerpts come directly from
the corpus rather than being rewritten by the model.

## Supported actions

| Action | Execution | Result |
| --- | --- | --- |
| Show sources | Local | Expands evidence referenced by the selected card |
| Explain further | Agent | Runs a narrower retrieval and appends new cards |
| Add to comparison | Agent | Retrieves the new entity and replaces or extends a comparison card |

## In scope

- Curated Markdown knowledge documents with source metadata.
- Chunking with stable evidence IDs.
- Keyword and vector retrieval.
- Optional reranking.
- Structured card planning.
- Schema and evidence-reference validation.
- Streaming status followed by an atomic validated card render.
- Source inspection.
- Conversation-local card state.
- Evaluation against Markdown and fixed-card baselines.

## Out of scope

- Arbitrary HTML, CSS, or JavaScript generation.
- User-uploaded or organization-specific knowledge bases.
- Web-wide search during answer generation.
- Autonomous modification of the knowledge corpus.
- Accounts, billing, collaboration, and production multitenancy.
- A general-purpose agent platform.
- More than the five approved card types.
- Persistent cross-device conversations.

## Grounding rules

1. Every factual field has at least one `evidenceId`.
2. An evidence ID must exist in the retrieval set for the current generation.
3. Direct excerpts are stored separately from generated summaries.
4. Generated content is labeled as `extractive`, `summarized`, or `inferred`.
5. Inferred content must be visibly distinguishable and cite supporting evidence.
6. If evidence is missing or conflicting, the response marks itself
   incomplete and states which of the two occurred. The two cases are
   reported separately, and insufficient-evidence detection accuracy is
   measured against that distinction.
7. The renderer never converts unverified model output into a card.

## Success metrics

Every metric below is classified as mechanical, model-dependent, or human in
[the evaluation protocol](../eval/PROTOCOL.md), which also pins the model,
effort, prompt version, corpus version, and repetition count that a run must
record. A number produced outside those rules is not comparable to one produced
inside them.

The classification is not bookkeeping. On the pinned model there is no
`temperature` parameter — it is removed, and sending one returns an error — so
run-to-run variance cannot be configured away and has to be measured instead.
Model-dependent metrics therefore require repetitions with dispersion reported;
a single run of one is a sample, not a measurement.

### Retrieval and grounding

- Retrieval Recall@10 on the evaluation set. Deterministic only while no model
  sits in the retrieval path; query rewriting and reranking each move it.
- Citation precision.
- Citation completeness at the card-field level.
- Unsupported-claim rate.
- Insufficient-evidence detection accuracy.

### Generative UI

- Card-type selection accuracy.
- Unnecessary-card rate.
- Invalid-card-spec rate before and after repair.
- Time to first useful content.
- Time to locate a requested fact.
- Source-open and follow-up interaction rates.
- Card-state preservation across follow-up turns.

### MVP exit criteria

Each is evaluated under [the evaluation protocol](../eval/PROTOCOL.md), which
records the model, effort, prompt version, and corpus version of the run that
produced it.

- At least 60 manually reviewed questions across both knowledge domains.
  *Mechanical.*
- At least 90% valid card specs without a second model call. *Model-dependent —
  a rate, so it requires the protocol's repetitions and dispersion, and is
  computed from the raw output captured before any repair attempt.*
- 100% of rendered factual fields reference valid retrieved evidence IDs.
  *Mechanical.*
- Zero executable model-generated code rendered in the browser. *Mechanical and
  binary.*
- A repeatable comparison of Markdown, fixed-card, and dynamic-card modes.
  *Mechanical: the harness runs on identical pinned inputs or refuses.*
- Documented findings, including cases where dynamic cards perform worse.

Four of the six are mechanical and determinate from a single run. That is
deliberate — a criterion needing statistics to interpret is a criterion people
argue about.

## Milestones

### M0 — Contracts and corpus

- Finalize evidence and card schemas.
- Write the initial knowledge-source manifest.
- Create the first evaluation questions.

### M1 — Grounded Markdown baseline

- Ingest, chunk, retrieve, rerank, and answer with citations.
- Record retrieval and grounding metrics.

### M2 — Fixed knowledge cards

- Implement the five deterministic card components.
- Render a fixed card layout from the same retrieval results.

### M3 — Dynamic card planning

- Let the model select and populate approved card types.
- Validate, repair once if needed, and render.

### M4 — Interactive exploration and evaluation

- Add the three supported actions.
- Run comparative usability and correctness tests.
- Publish the findings and decide whether to expand the card vocabulary.
