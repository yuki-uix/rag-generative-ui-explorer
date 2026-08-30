---
title: A2UI as an output boundary for RAG
domain: intersection
tags:
  - ui-from-knowledge-structure
  - evidence-aware-cards
  - field-level-citation
  - ui-driven-retrieval
  - card-state-continuity
summary: RAG can supply evidence and state to an A2UI surface, but retrieval, grounding, presentation planning, and UI transport remain separate contracts.
author: yuki-uix
revised: 2026-08-30
sources:
  - sourceType: specification
    title: A2UI Protocol v0.9.1
    url: https://a2ui.org/specification/v0.9.1-a2ui/
    author: A2UI Project contributors
    published: 2025-12-03
    retrieved: 2026-08-30
    license: Apache-2.0 project specification. Original explanatory prose only; published is the specification's Last Updated date.
    supports:
      - four-contracts-not-one-pipeline
      - retrieved-content-belongs-in-state
      - evidence-lineage-needs-an-application-contract
      - actions-can-start-another-retrieval-turn
      - preserve-state-by-addressing-it
    primary: true
  - sourceType: documentation
    title: A2UI over Model Context Protocol
    url: https://a2ui.org/guides/a2ui_over_mcp/
    author: A2UI Project contributors
    retrieved: 2026-08-30
    license: Apache-2.0 project documentation. Original explanatory prose only; no publication date stated.
    supports:
      - mcp-is-a-delivery-path-not-the-retriever
      - control-what-reenters-model-context
    primary: false
  - sourceType: documentation
    title: "A2UI + MCP Apps: Combining the best of declarative and custom agentic UIs"
    url: https://developers.googleblog.com/en/a2ui-and-mcp-apps/
    author: Google A2UI Team, Ido Salomon, and Liad Yosef
    published: 2026-06-17
    retrieved: 2026-08-30
    license: Google Developers Blog. Original explanatory prose only; short attributed quotations if needed.
    supports:
      - mcp-is-a-delivery-path-not-the-retriever
      - control-what-reenters-model-context
    primary: false
---

# A2UI as an output boundary for RAG

RAG and A2UI can be connected cleanly because they answer different questions.
RAG determines which external evidence is available for an answer. A2UI
determines how an agent communicates an interactive surface to a renderer. One
does not imply the other.

## Four contracts, not one pipeline

A retrieval-driven generative interface contains at least four contracts:

1. **Retrieval:** a query becomes ranked, addressable evidence.
2. **Grounding:** generated factual claims remain linked to that evidence.
3. **Presentation planning:** the system selects an appropriate component or
   composition for the task and knowledge shape.
4. **UI delivery:** the chosen structure and state reach a renderer and respond
   to user actions.

A2UI primarily standardises the fourth contract and supplies useful primitives
for the third. It does not measure retrieval quality, decide whether a claim is
entailed by a source, or require citations. Calling the whole stack "A2UI RAG"
can hide which layer failed.

## Retrieved content belongs in state

A2UI separates component structure from a surface data model. That makes the
data model the natural destination for retrieved records, answer fields, and
source metadata, while the component list describes how those values are
presented.

The separation enables reuse. A comparison surface can keep the same column,
row, and source-control structure while `updateDataModel` replaces the entities
or adds a newly retrieved field. Regenerating the component graph for every
retrieval result spends model time on stable structure and makes state
continuity harder.

It also suggests a division of authority: application code can assemble the
grounded data model deterministically, while the model chooses among approved
surface patterns. Letting the model copy evidence into both structure and data
creates two versions of the answer that can disagree.

## Evidence lineage needs an application contract

The base protocol defines surfaces, components, data binding, actions, and
transport metadata. It does not require every factual value to carry an
evidence identifier or support relation.

A RAG application therefore needs to add provenance in its catalog and data
model. A knowledge-card component might require each factual field to contain
`text`, `evidenceIds`, and a support status, while a source-drawer action accepts
only identifiers from the retrieval bundle used for that turn.

That rule must be validated before translation into A2UI messages. Once an
unsupported sentence is flattened into a generic `Text` component, the
renderer cannot recover which part was meant to be cited. A portable UI
protocol is not a substitute for a grounded domain contract.

## Actions can start another retrieval turn

An A2UI action carries more structure than a free-form follow-up message: the
surface, the component that initiated it, the action name, and a context
payload. For RAG, that payload can become a precise query transformation.

"Compare this with GraphRAG" can carry the identifier for the selected item,
the visible comparison dimensions, and the evidence set already on screen. The
retrieval layer can then search for the missing counterpart or dimensions
without asking a model to infer all of that state from conversation prose.

The action should not bypass retrieval. A button labelled "add to comparison"
is a request to find and ground new material, not permission to fill a column
from model memory.

## Preserve state by addressing it

Surface identifiers, component identifiers, and JSON Pointer paths give
updates stable targets. A follow-up retrieval can update `/comparison/items/2`
without discarding which sources are expanded or which comparison rows the
user selected.

Stable addressing is necessary but not sufficient. The application still has
to decide which state belongs to the UI locally, which state is knowledge from
the retrieval turn, and which state belongs to the conversation. Sending the
entire surface data model back on every action can preserve continuity while
also bloating context and leaking local-only state.

## MCP is a delivery path, not the retriever

A2UI can be returned from MCP resources and tools with the
`application/a2ui+json` media type. A resource can expose a prescribed surface;
a tool can populate or generate a surface from its arguments. MCP Apps can also
host custom HTML experiences alongside declarative A2UI components.

None of those mechanisms specifies vector search, keyword search, reranking,
or evidence assembly. An MCP tool may call a retriever behind its boundary, but
that is the tool implementation. Keeping the distinction visible makes it
possible to compare the same retrieval system delivered through a local
renderer, A2UI over MCP, or another transport.

## Control what reenters model context

The A2UI-over-MCP guidance uses resource audience annotations to distinguish
content intended for the user from content intended for the assistant. That
matters when a surface contains a large declarative tree or data already known
to the model.

The model needs semantic state for the next decision: selected entities,
filters, action context, and evidence identifiers. It does not necessarily need
the full rendered surface repeated into its context. Separating user-visible UI
from model-visible state reduces token duplication and the risk that display
text is later mistaken for fresh retrieved evidence.

## What this means here

The design calls for keeping `KnowledgeUIResponse` as the grounded domain
contract even if an A2UI experiment is added later. Translation would happen
after schema, evidence-reference, and policy validation:

```text
retrieval bundle
  -> grounded KnowledgeUIResponse
  -> validation gate
  -> A2UI surface/data-model adapter
  -> native renderer
```

The first useful experiment is therefore not "let the model emit arbitrary
A2UI." It is to define a custom catalog for the five existing card types and
measure whether translating the already validated response preserves evidence,
interaction semantics, accessibility, latency, and deterministic rendering.
