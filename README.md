# RAG Generative UI Explorer

An experimental knowledge explorer that combines retrieval-augmented generation
(RAG) with generative UI. It retrieves grounded evidence about **RAG** and
**Generative UI**, then composes the smallest useful set of interactive knowledge
cards for the current question.

## Review the current work

**[Open the project preview](https://yuki-uix.github.io/rag-generative-ui-explorer/)**
— project overview, interactive knowledge-card examples with source drawers, and
the image-retrieval experiment with original images, gold review and real rankings.
The preview is published from the review branch and links to its exact commit;
it does not imply the PR has been merged or the MVP is complete.

The GitHub Pages preview runs entirely in the browser. It does not provide the
live `/api/ask` service; the online Markdown baseline remains a separate
Cloudflare Worker deployment. See [web delivery and review](docs/WEB-REVIEW.md)
for scope, local commands and deployment details.

## Product hypothesis

Most RAG applications return a block of prose. This project tests whether users
can understand and explore technical knowledge more effectively when the same
retrieved evidence is rendered as task-appropriate cards: definitions,
comparisons, mechanisms, procedures, and source excerpts.

The model may select and populate approved card types. It may not generate
arbitrary executable UI code in the MVP.

## MVP

The first release supports:

- A curated, versioned knowledge corpus covering RAG and Generative UI.
- Hybrid retrieval and reranking over that corpus.
- Five card types: definition, comparison, mechanism, procedure, and evidence.
- Field-level evidence references on generated factual content.
- Three interactions: show sources, explain further, and add to comparison.
- An A/B evaluation surface for Markdown, fixed cards, and dynamically selected
  cards.
- Explicit insufficient-evidence responses.

See [MVP](docs/MVP.md), [architecture](docs/ARCHITECTURE.md), and
[knowledge scope](docs/KNOWLEDGE_SCOPE.md). The proposed post-MVP runtime
evolution is described in [Backend evolution path](docs/BACKEND-EVOLUTION.md).

## Core principles

1. Retrieval produces evidence, not UI.
2. The model produces a validated card specification, not React or HTML.
3. The renderer owns layout, accessibility, interaction, and design tokens.
4. Every factual field must point to retrieved evidence.
5. Local UI interactions do not call the model unless new reasoning or retrieval
   is required.
6. The system is allowed to say that the corpus is insufficient.

## Proposed stack

- TypeScript, React, and Next.js
- AI SDK for streaming and tool orchestration
- Zod and JSON Schema for contracts
- PostgreSQL with pgvector for hybrid retrieval
- A custom knowledge-card renderer, with json-render evaluated as an optional
  composition layer
- Playwright and Vitest for UI and contract tests

The stack is provisional until the first implementation milestone validates the
contracts and evaluation plan.

## Repository status

The repository includes the contracts, curated corpus, retrieval and Markdown
baseline, fixed card components, and the native card planner with validation.
Remaining integration and evaluation work is tracked in GitHub issues.

Work is tracked as GitHub issues grouped by milestone (M0–M4). M5–M8 are a
future runtime evolution path, not part of the current MVP acceptance criteria.

The [framework practice route](https://github.com/yuki-uix/rag-generative-ui-explorer/issues/84)
starts with a native baseline before adding LangChain and LangGraph adapters.
Run it without credentials:

```bash
pnpm install --frozen-lockfile
pnpm framework:smoke
pnpm framework:compare  # native + LangChain, identical fixed evidence, no key
pnpm framework:graph    # LangGraph: check coverage, supplement at most once, no key
```

This exercises real retrieval, SDK request construction and citation validation
with synthetic model responses. `framework:compare` adds LangChain's message and
structured-output API, with actual request differences recorded. For the live
command and artifacts, see [framework experiments](eval/framework/README.md);
for the observed live run and framework tradeoffs, see [F2 notes](eval/framework/F2-LANGCHAIN.md).
The graph's three offline paths, complete traces, failure case and limits are
documented in [F3 notes](eval/framework/F3-LANGGRAPH.md).

## Independent image retrieval experiment

The [image-retrieval pilot](eval/images/README.md) compares the existing BM25
implementation on paired source text, real OCR text, and real CLIP image/text
embeddings on the same 24-image corpus. It has its own [task breakdown](eval/images/TASKS.md),
[frozen protocol](eval/images/PROTOCOL.md), input hashes and saved observations.
`pnpm images:replay --out /absolute/path/to/fresh/output` recomputes the comparison
offline. The [PR review and counterbalanced follow-up](eval/images-review/REVIEW.md)
withdraw the original aggregate effectiveness claims, audit gold/ties and separate
color from position with equal printed text. `pnpm images:review --out
/absolute/path/to/fresh/output` replays that separate diagnostic. These experiments
do not add LLaVA or alter the F5 baseline.

## License

[MIT](LICENSE)
