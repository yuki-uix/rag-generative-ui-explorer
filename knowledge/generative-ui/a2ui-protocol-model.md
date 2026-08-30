---
title: The A2UI protocol model
domain: generative-ui
tags:
  - agent-ui-protocols
  - declarative-ui-schemas
  - component-registries
  - streaming-rendering
  - state-continuity
summary: A2UI separates a streamed surface definition, its data model, and user actions while the client keeps rendering authority through a negotiated component catalog.
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
      - what-a2ui-standardises
      - a-surface-has-a-lifecycle
      - flat-components-are-a-streaming-choice
      - the-catalog-is-a-trust-contract
      - structure-state-and-actions-are-separate
      - transport-is-not-the-protocol
      - generation-needs-a-validation-loop
      - the-version-line-matters
    primary: true
  - sourceType: documentation
    title: A2UI Catalogs
    url: https://a2ui.org/concepts/catalogs/
    author: A2UI Project contributors
    retrieved: 2026-08-30
    license: Apache-2.0 project documentation. Original explanatory prose only; no publication date stated.
    supports:
      - the-catalog-is-a-trust-contract
      - generation-needs-a-validation-loop
    primary: false
  - sourceType: documentation
    title: A2UI Message Types
    url: https://a2ui.org/reference/messages/
    author: A2UI Project contributors
    retrieved: 2026-08-30
    license: Apache-2.0 project documentation. Original explanatory prose only; no publication date stated.
    supports:
      - a-surface-has-a-lifecycle
      - structure-state-and-actions-are-separate
    primary: false
---

# The A2UI protocol model

A2UI is easier to understand as a state synchronisation protocol for native UI
than as a format for sending a finished page. An agent produces declarative
messages; a client interprets them against a component vocabulary it already
trusts and owns.

## What A2UI standardises

The protocol standardises the semantic contract between an agent and a
renderer: how to create an independently addressable UI region, add or replace
components, update the data those components read, and remove the region. It
does not standardise React, Flutter, CSS, or a particular agent framework.

This boundary is the central architectural choice. The agent communicates UI
intent as data. The host decides how that intent becomes native components,
inherits the host design system, and participates in the host's accessibility
model.

## A surface has a lifecycle

A **surface** is an independently managed region of agent-driven UI. A chat
answer, a persistent side panel, and a task form can be different surfaces even
when one conversation owns all three.

The current production protocol family uses four server-to-client messages:

1. `createSurface` establishes a `surfaceId`, catalog, optional theme, and data
   synchronisation preference.
2. `updateComponents` adds or replaces component definitions within that
   surface.
3. `updateDataModel` replaces data at a JSON Pointer path without requiring the
   component structure to be resent.
4. `deleteSurface` removes the surface and its associated state.

Message order therefore carries meaning. Updating a surface before it exists,
or replaying lifecycle messages out of order, is not equivalent to delivering
the same objects eventually.

## Flat components are a streaming choice

Components arrive as a flat adjacency list. Each component has an identifier,
and containers refer to child identifiers rather than nesting the entire tree
inside one JSON value. A component with the identifier `root` anchors the
surface tree.

That representation does two jobs. It is easier for a model to produce and
repair small independent objects than a deeply nested tree, and it lets the
client accept components incrementally. A parent may refer to a child that has
not arrived yet; the renderer can hold the reference or show a placeholder
until a later message completes it.

The flat list does not make partial output automatically useful. A renderer
still needs an explicit policy for unresolved children, invalid references,
replacement, and visible reflow while the stream is incomplete.

## The catalog is a trust contract

A **catalog** is the shared vocabulary between producer and renderer. Its JSON
Schema declares the component names, their properties, available client-side
functions, and theme parameters. The agent may ask for a component in the
catalog; the client supplies the implementation.

Catalog negotiation is capability negotiation, not a package download. A
catalog identifier tells the two sides which contract they share. A production
application can expose a small domain catalog rather than the Basic Catalog,
keeping the model inside reviewed components and the product's own visual
language.

This is also where interoperability becomes concrete. Two clients claiming the
same catalog must agree on component semantics, not merely accept the same
names. If one renders a `Confirm` action as harmless navigation and another as
an irreversible commit, schema compatibility has hidden a behavioural
incompatibility.

## Structure, state, and actions are separate

The component list describes structure. The per-surface data model describes
state. Bindable properties can point into that state with JSON Pointer paths,
so a server can update a value without regenerating the tree and multiple
components can react to the same value.

User interaction travels in the other direction as an action. The action names
the surface and source component and carries a context payload. Some actions
can be resolved locally; others return to the server and may cause new
component or data-model messages.

This separation prevents a common generative-UI mistake: treating every click
as a reason to ask the model to redraw everything. Local state remains local
when no new reasoning is needed, while agent actions cross the boundary
explicitly.

## Transport is not the protocol

A2UI requires ordered, framed delivery and, for interactive applications, a
return channel. It does not require one transport. A2A, AG-UI, MCP, SSE plus a
return mechanism, WebSockets, and ordinary request-response APIs can carry
A2UI messages with different trade-offs.

Consequently, adopting AG-UI to connect a frontend and agent does not replace
A2UI, and emitting A2UI does not give an application AG-UI's event vocabulary
or shared-state machinery. One can carry the other because they occupy
different layers.

## Generation needs a validation loop

The v0.9 protocol family is prompt-first: a schema, catalog, instructions, and
examples are supplied to the model, then its output is parsed and validated.
That makes catalogs more expressive than formats limited to a provider's
structured-output subset, but moves more responsibility into post-generation
validation and correction.

There are at least three distinct checks:

- Envelope validation asks whether each streamed message has a permitted
  protocol shape.
- Catalog validation asks whether a named component and its properties belong
  to the negotiated vocabulary.
- Graph validation asks whether structural references resolve and form a
  renderable surface.

Passing all three still does not establish that the selected interface is a
good answer to the user's task. Protocol validity and presentation quality are
separate evaluation targets.

## The version line matters

As of 2026-08-30, A2UI v0.9.1 is identified by the project as the current
production release, while v1.0 is a candidate and v0.8 is legacy. Many early
examples use the v0.8 names `surfaceUpdate`, `dataModelUpdate`, and
`beginRendering`. The v0.9 family uses `createSurface`, `updateComponents`,
`updateDataModel`, and `deleteSurface` and has a different component shape.

Version labels belong in examples, fixtures, and stored traces. A document
saying only "A2UI JSON" is not enough to reconstruct which parser and catalog
were expected.

## What this means here

This project already implements the narrowest useful part of the same idea: a
model selects from reviewed knowledge-card types, validated data crosses the
boundary, and React owns presentation. The design does not call for adopting
A2UI during the MVP.

An interoperability experiment would therefore be an adapter experiment, not
a rewrite. The five card contracts could become a small custom A2UI catalog,
and a `KnowledgeUIResponse` could be translated into a surface plus data-model
updates. That experiment must preserve the stronger properties already present
here — especially field-level evidence identifiers — because the base A2UI
contract does not make retrieved evidence provenance part of every factual
field.
