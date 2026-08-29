# RAG Generative UI Explorer

An experimental knowledge explorer that combines retrieval-augmented generation
(RAG) with generative UI. It retrieves grounded evidence about **RAG** and
**Generative UI**, then composes the smallest useful set of interactive knowledge
cards for the current question.

## Product hypothesis

Most RAG applications return a block of prose. This project tests whether users
can understand and explore technical knowledge more effectively when the same
retrieved evidence is rendered as task-appropriate cards such as definitions,
comparisons, mechanisms, timelines, procedures, and source excerpts.

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
[knowledge scope](docs/KNOWLEDGE_SCOPE.md).

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

Planning and contract design. Application scaffolding is the next milestone.

## License

[MIT](LICENSE)
