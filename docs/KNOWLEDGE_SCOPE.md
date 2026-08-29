# Knowledge scope

## Purpose

The corpus is intentionally narrow. It should contain enough connected concepts
to test definitions, comparisons, mechanisms, procedures, and cross-domain
questions without becoming a general AI knowledge base.

Each topic bullet below has a matching id in
`packages/corpus/src/topics.ts`, and note `tags` must come from that list. A
test parses this file and asserts the two agree in both directions, so a topic
added here without an id fails, and an id with no entry here fails too. Editing
a bullet's wording means editing its `label` in the same commit.

## Domain A — Retrieval-augmented generation

Initial topics:

- RAG motivation and core architecture.
- Ingestion, parsing, chunking, and metadata.
- Sparse, dense, and hybrid retrieval.
- Embeddings and similarity measures.
- Query rewriting, decomposition, and expansion.
- Reranking and candidate fusion.
- Context assembly and prompt construction.
- Grounded generation and citation design.
- Failure modes: retrieval miss, lost context, conflicting sources, and
  unsupported synthesis.
- Evaluation: Recall@K, MRR, nDCG, faithfulness, citation precision, answer
  completeness, and end-to-end task success.
- Advanced patterns: multi-hop, corrective RAG, agentic RAG, GraphRAG, and
  multimodal RAG.
- Production concerns: freshness, versioning, access control, latency, cost,
  observability, and cache invalidation.

## Domain B — Generative UI

Initial topics:

- Definitions and boundaries of Generative UI.
- Design-time generation versus runtime generation.
- Content, component, layout, behavior, and full-application generation.
- Component registries and tool-to-component mapping.
- Declarative UI schemas and UI grammars.
- Streaming and incremental rendering.
- State continuity and malleable interfaces.
- Mixed-initiative interaction and human-in-the-loop workflows.
- Agent–UI protocols, including AG-UI, A2UI, and MCP Apps.
- Sandboxed open-ended HTML generation.
- Security, accessibility, predictability, latency, and user control.
- Evaluation: task completion, correction rate, comprehension, consistency,
  accessibility, and user preference.

## Intersection topics

- Choosing a UI based on retrieved knowledge structure.
- Evidence-aware knowledge cards.
- Claim-level and field-level citations.
- Interactive follow-up retrieval from UI actions.
- Preserving card state across retrieval turns.
- Comparing Markdown, fixed cards, and dynamically selected cards.
- Preventing generated presentation from overstating weak evidence.

## Source policy

The corpus should favor:

1. Primary research papers.
2. Official specifications and protocol documentation.
3. Official framework documentation for implementation-specific concepts.
4. Clearly attributed project notes written for this repository.

Each document must include title, canonical URL, author or organization, date,
retrieval date, license or quotation constraints when relevant, and topic tags.
The repository should store original explanatory notes and short compliant
excerpts rather than copying entire copyrighted sources.

## Initial corpus target

- 12–20 RAG notes.
- 12–20 Generative UI notes.
- 6–10 intersection notes.
- 60 manually authored evaluation questions spanning the three groups.
