# A2UI research guide

This guide turns the repository's A2UI references into a study and experiment
path. It is context for future research, not a decision to adopt A2UI in the
MVP.

## Current version baseline

Use **A2UI v0.9.1** when reading examples or sketching an adapter. The project
labels it the current production release as of 2026-08-30. Treat v1.0 as a
candidate and v0.8 as legacy.

The version distinction is visible in the message vocabulary:

| Legacy v0.8 | v0.9 family |
| --- | --- |
| `beginRendering` | `createSurface` |
| `surfaceUpdate` | `updateComponents` |
| `dataModelUpdate` | `updateDataModel` |
| wrapped component shape | flat component name and properties |

Do not copy an example into a fixture until its protocol version, catalog, and
renderer version are named together.

## A compact mental model

```text
retriever -> evidence -> grounded domain response -> A2UI adapter
                                                     |
                                                     v
Agent -- ordered A2UI messages --> MessageProcessor --> Surface
  ^                                  |                  |
  |                                  v                  v
  +----------- user action ------- Data Model      Native components
                                  + Catalog         owned by the host
```

The important boundaries are:

- **Surface:** an independently addressable region with its own component graph
  and data model.
- **Catalog:** the schema and semantics of components and client functions the
  agent is allowed to request.
- **Message processor:** validates ordered lifecycle and update messages and
  derives renderable surface state.
- **Renderer:** maps catalog entries to native components and owns appearance,
  accessibility, and local interaction.
- **Transport:** carries messages and actions; A2UI does not require one
  transport.

## How the repository maps to A2UI

| Repository concept | Closest A2UI concept | Important mismatch |
| --- | --- | --- |
| `KnowledgeUIResponse` | surface plus data-model messages | The response also carries corpus and grounding metadata. |
| card discriminated union | custom catalog | Current cards are semantic units, not general layout primitives. |
| React card mapping | renderer catalog implementation | The current renderer has no protocol processor or surface lifecycle. |
| `Evidence[]` | application-defined data-model records | A2UI does not prescribe retrieval evidence or claim support. |
| field-level `evidenceIds` | custom component/data schema | This stronger invariant must survive any adapter. |
| suggested actions | A2UI actions | Action naming and payloads need an explicit compatibility map. |
| conversation/knowledge/UI state split | transport state, surface data, local renderer state | Sending a whole data model back can collapse states the project keeps separate. |

The project already shares A2UI's central safety choice: the model emits
validated intent and the host owns rendering. An A2UI prototype would test
interoperability and surface lifecycle, not prove the basic component-registry
pattern again.

## Recommended study path

### 1. Establish the protocol boundary

- [Google Cloud Next 2026: Generative UI for any agent, anywhere](https://www.youtube.com/watch?v=UsMDkEsR-ok)
  explains where A2UI, AG-UI, and MCP Apps sit relative to one another.
- [A2UI protocol v0.9.1](https://a2ui.org/specification/v0.9.1-a2ui/)
  is the source of truth for messages, data binding, actions, validation, and
  transport requirements.
- Read [The A2UI protocol model](../knowledge/generative-ui/a2ui-protocol-model.md)
  afterwards as the repository-specific synthesis.

Questions to answer:

- What must arrive in order?
- Which failures belong to the protocol processor rather than the renderer?
- What is negotiated by catalog identity, and what remains application policy?

### 2. Follow one implementation end to end

- [Flutter + A2UI = GenUI](https://www.youtube.com/watch?v=tXeyaV1gVJk)
  shows the architecture and a live implementation.
- [A2UI React renderer package](https://www.npmjs.com/package/@a2ui/react)
  shows the `MessageProcessor`, `A2uiSurface`, and catalog relationship for a
  stack closer to this repository.
- [A2UI quickstart](https://a2ui.org/quickstart/) runs the restaurant sample
  with an agent and renderer.

Questions to answer:

- Which code is protocol-generic and which code is catalog-specific?
- How are unresolved streamed references displayed?
- How are local and server actions distinguished?

### 3. Study the RAG intersection

- [A2UI over MCP](https://a2ui.org/guides/a2ui_over_mcp/) demonstrates A2UI as
  MCP resources and tool results.
- [A2UI + MCP Apps](https://developers.googleblog.com/en/a2ui-and-mcp-apps/)
  distinguishes declarative native components from sandboxed custom apps.
- Read [A2UI as an output boundary for RAG](../knowledge/intersection/a2ui-as-an-output-boundary-for-rag.md)
  for the grounding and retrieval implications.

Questions to answer:

- Is MCP only carrying the UI, or is an MCP tool also implementing retrieval?
- Which surface state must be visible to the model on the next turn?
- How does a source identifier remain attached to a factual field after
  translation and rendering?

## Proposed experiment sequence

### Experiment A — deterministic adapter

Translate one already validated `KnowledgeUIResponse` fixture into A2UI v0.9.1
messages without an additional model call.

Success means:

- every card and field survives a round trip through a message processor;
- every evidence identifier remains attached to the same factual field;
- unknown card types and broken component references fail closed;
- the resulting surface remains keyboard and screen-reader usable;
- the adapter adds measured, bounded latency.

This separates protocol integration risk from generation quality.

### Experiment B — stable structure, changing retrieval data

Keep a comparison or procedure surface structure fixed and apply a second
retrieval result through `updateDataModel`.

Measure:

- whether local expansion and selection state survives;
- how much of the message stream changes;
- whether stale evidence can remain visible after a data replacement;
- whether the model is needed at all for the update.

### Experiment C — action-driven retrieval

Map one existing agent action, such as `add to comparison`, to an A2UI action.
Use its structured context to issue the next retrieval query, then update the
existing surface rather than replacing it.

Measure whether the structured action improves retrieval success or reduces
query-rewriting ambiguity compared with a natural-language follow-up.

### Experiment D — generated composition

Only after the deterministic adapter is reliable, allow a model to compose the
five-card custom catalog. Keep the existing grounding gate before the adapter
and compare the result with the repository's native planner.

The question is not whether A2UI JSON can be generated. The useful question is
whether the protocol and catalog improve portability or interaction without
weakening grounding, predictability, accessibility, or evaluation control.

## Decisions to keep explicit

- **Adoption scope:** research adapter, optional output format, or primary
  internal representation.
- **Catalog granularity:** five semantic cards versus lower-level layout
  primitives.
- **Grounding location:** domain response, A2UI data model, component props, or
  more than one with a single authoritative copy.
- **Transport:** existing application stream, AG-UI, MCP, or A2A. This should be
  chosen for an actual boundary, not because it appears next to A2UI in a
  diagram.
- **Version policy:** how fixtures and stored traces declare protocol and
  catalog versions, and when candidates may enter experiments.
- **Context policy:** which UI state returns to the agent and which remains
  local.

## Primary references

- [A2UI v0.9.1 specification](https://a2ui.org/specification/v0.9.1-a2ui/)
- [A2UI concepts](https://a2ui.org/concepts/overview/)
- [Catalog architecture](https://a2ui.org/concepts/catalogs/)
- [Agent development guide](https://a2ui.org/guides/agent-development/)
- [Client setup](https://a2ui.org/guides/client-setup/)
- [Message reference](https://a2ui.org/reference/messages/)
- [v0.9 to v0.9.1 evolution guide](https://a2ui.org/specification/v0.9.1-evolution-guide/)
- [A2UI over MCP](https://a2ui.org/guides/a2ui_over_mcp/)
