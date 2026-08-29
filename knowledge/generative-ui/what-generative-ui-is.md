---
title: What generative UI is
domain: generative-ui
tags:
  - genui-definitions
summary: The boundary between an interface a model populates and an interface a model authors, and why that line decides what can be reviewed.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: AG-UI Overview
    url: https://docs.ag-ui.com/
    author: AG-UI Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    primary: true
  - sourceType: documentation
    title: "A2UI: Agent-to-User Interface"
    url: https://github.com/a2ui-project/a2ui
    author: A2UI Project contributors
    retrieved: 2026-08-29
    license: Apache-2.0. Short attributed quotations only; no publication date stated.
  - sourceType: documentation
    title: Generative User Interfaces
    url: https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces
    author: Vercel
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
---

# What generative UI is

"Generative UI" names a range of practices that share a slogan and differ in
what they actually let a model decide. The useful definition is not about
novelty but about authority: which parts of the interface does the model
determine, and which are fixed before it runs.

## A spectrum, not a category

At one end, a model chooses among components a human wrote and supplies their
data. The set of possible interfaces is enumerable in advance; the model picks
from it. This is what tool-to-component mapping in current SDKs does, and what
the two agent-UI protocols describe: an agent emits structured intent, and a
client renders it with its own component library.

At the other end, a model writes markup, styles, and scripts, and the host
displays whatever comes back. The set of possible interfaces is unbounded.

Between those sit approaches where the model composes from a vocabulary but
controls arrangement — a declarative layout tree over known primitives.

The interesting property is not where a system sits but that the position is a
deliberate choice with different consequences at each point.

## What changes along the spectrum

**Reviewability.** A fixed component set can be inspected once, by a person,
and that review holds for every future rendering. Generated markup can only be
reviewed per instance, which in practice means not at all.

**Failure mode.** A model that picks the wrong component from a registry
produces a wrong-but-working interface. A model that emits broken markup
produces a broken page — and one that emits *working* markup can produce
anything at all, including something that looks like the host's own UI.

**Accessibility.** Components carry their semantics with them: a reviewed table
component is a table for a screen reader every time. Generated markup is
accessible only when the generation happened to make it so, which is a coin
flip repeated per response.

**Testability.** A bounded vocabulary can be enumerated and each member tested.
An unbounded output space cannot be, so testing shifts from "does it work" to
"did the sandbox hold".

## The distinction the term obscures

Calling all of this "generative UI" hides the question that matters, which is
whether the model's output crosses the boundary into executable code.

A model emitting `{"type": "comparison", "entities": [...]}` and a model
emitting `<div onclick="...">` are described the same way in most writing about
the subject. They have almost nothing in common operationally: one is data
validated against a schema, the other is code, and the difference determines
the entire security model.

## What this means here

This project sits deliberately at the constrained end. The model is to select
among five reviewed card types and populate their fields, never emitting
markup, styles, or script. The five types and their grammar exist today as a
validated schema; the selection that will use them is M3.

The consequence worth being honest about: some interfaces are unreachable. A
question whose best presentation is a diagram, a map, or an interactive
simulation gets a card instead, and the card is worse. That is the price of an
output space small enough to review, and the MVP's question is whether it buys
enough in exchange.