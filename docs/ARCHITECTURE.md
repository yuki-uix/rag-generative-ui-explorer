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

#### Evidence ID construction

Evidence IDs are stable identifiers, not opaque handles. Grounding validation,
stored evaluation labels, and generation logs all resolve through them, so an ID
that changes on re-ingestion invalidates every one of those.

```text
{documentId}#{sectionSlug}#{chunkIndex}-{contentHash}
rag/hybrid-retrieval#reciprocal-rank-fusion#0-4f2a9c1b
```

- `documentId` is the corpus-relative path of the note without its extension.
- `sectionSlug` is the slugified heading the chunk belongs to; text appearing
  before the first heading uses `body`.
- `chunkIndex` is the zero-based position of the chunk within its section.
- `contentHash` is the first eight hex characters of the SHA-256 of the chunk
  text, with runs of whitespace collapsed so that reflowing a paragraph without
  changing its words leaves the ID untouched.

Editing one paragraph therefore rotates only that chunk's ID. **Known
limitation:** inserting or deleting a chunk shifts `chunkIndex` for every later
chunk *in the same section*, rotating their IDs even though their text is
unchanged. Anchoring chunk boundaries to headings keeps that blast radius inside
one section rather than across the whole document. Re-labelling cost is real but
bounded, and it is the price of distinguishing two chunks with identical text.

The rule is implemented in `packages/contracts/src/evidence-id.ts` and is
covered by tests asserting re-ingestion stability, single-paragraph locality,
and cross-document distinctness.

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

### Retrieval seam and the pgvector deferral

The first retrieval implementation is in process, not in Postgres. Ingestion
(`packages/corpus`) turns the corpus into `Evidence[]`, and a lexical
`Retriever` — BM25 — builds an inverted index from that in memory at startup.
The `Retriever` interface, `search(query, k) -> Candidate[]`, is the seam at
which a database-backed implementation substitutes in: callers depend on
`search`, never on how the index is stored or scored.

pgvector is deferred until the corpus outgrows an in-process index. With a few
hundred chunks, an in-memory inverted index is cheaper to build and faster to
query than a round trip to Postgres, and it keeps the test suite and dev server
running with no database. When the corpus grows to the point where that stops
being true, the pgvector arm implements the same `Retriever` interface rather
than a new one, so nothing above the seam changes.

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
