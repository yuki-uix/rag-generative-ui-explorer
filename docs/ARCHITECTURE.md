# Architecture

## System boundary

The system separates retrieval, card planning, validation, and rendering. The
language model never writes application code and never queries the database
directly.

```text
User query
   |
   v
Query analysis and decomposition
   |
   v
Hybrid retrieval -> reranking -> Evidence[]
   |                              |
   |                              +-> source drawer
   v
Knowledge-card planner -> KnowledgeUIResponse
   |
   v
Schema validation -> evidence-reference validation -> policy checks
   |
   v
Deterministic React card renderer
   |
   +-> local interaction
   |
   +-> agent interaction -> new query analysis and retrieval
```

## Data contracts

### Evidence

An immutable, addressable excerpt produced by ingestion and retrieval. Evidence
contains source metadata and scores but no presentation instructions.

### Knowledge card

A model-generated, schema-constrained presentation object. Factual fields carry
evidence IDs. Card types are discriminated unions, not free-form component trees.

### Knowledge UI response

The response envelope contains cards, suggested actions, the evidence used for
the response, corpus version, generation time, and an incomplete flag.

## Retrieval

The initial retrieval design combines:

- PostgreSQL full-text search for exact terminology.
- pgvector similarity search for semantic matches.
- Reciprocal-rank fusion to combine candidates.
- An optional reranker before evidence is sent to the card planner.

Retrieval and card planning are evaluated independently so attractive UI cannot
hide poor retrieval.

## Generation

The planner receives only the current question, approved card schemas, and the
reranked evidence set. It must produce the smallest useful card set and may
return no cards when evidence is insufficient.

Generation is attempted once. One constrained repair attempt is allowed for
syntax or schema failures; evidence-policy failures are not silently repaired by
inventing new citations.

## Rendering

The renderer maps each card discriminator to a reviewed React component. It owns:

- Layout and responsive behavior.
- Design tokens and theme support.
- Keyboard and screen-reader behavior.
- Loading, empty, incomplete, conflicting, and error states.
- Local expansion and selection state.

## State

Three states remain separate:

1. `conversationState`: questions, responses, and agent actions.
2. `knowledgeState`: corpus version, retrieved evidence, and source metadata.
3. `uiState`: expanded evidence, selected tabs, and comparison selections.

UI state must not become the source of truth for knowledge or citations.

## Security and trust

- Treat corpus text as untrusted input and isolate it from system instructions.
- Validate every model-produced object at runtime.
- Allow only known card and action discriminators.
- Reject unknown evidence IDs.
- Sanitize source excerpts before rendering.
- Keep API credentials on the server.
- Do not execute corpus or model-provided code.
- Log the corpus version, retrieval set, model output, and validation result for
  reproducible evaluation.
