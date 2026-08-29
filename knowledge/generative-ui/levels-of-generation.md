---
title: Levels of generation
domain: generative-ui
tags:
  - generation-levels
summary: Content, component, layout, behaviour, and whole-application generation, and why the level a system generates at determines what can go wrong.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: "A2UI: Agent-to-User Interface"
    url: https://github.com/a2ui-project/a2ui
    author: A2UI Project contributors
    retrieved: 2026-08-29
    license: Apache-2.0. Short attributed quotations only; no publication date stated.
    primary: true
  - sourceType: specification
    title: "SEP-1865: MCP Apps - Interactive User Interfaces for MCP"
    url: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
    author: Ido Salomon, Liad Yosef, Olivier Chafik et al.
    published: 2025-11-21
    retrieved: 2026-08-29
    license: Status Final, Extensions Track. Short attributed quotations only; published is the SEP Created date.
---

# Levels of generation

"The model generates the UI" can mean five quite different things. Naming them
separately is worth the pedantry, because the failure modes and the review
burden change completely between one level and the next.

## Content

The model produces text that a fixed interface displays. A chat bubble, a
summary, a caption.

Everything about the interface is decided in advance. The only thing that can go
wrong is that the text is wrong — which is a large problem, but a familiar one
with familiar mitigations: citation, grounding, and letting the reader see the
source.

## Component

The model chooses which reviewed component to render and supplies its data. Show
a weather card, a flight list, a comparison table.

The output is data validated against a schema. This is the level the current
generation of agent-UI protocols is built for: an agent sends declarative intent
and the client renders it with its own component library, so the rendering
authority stays with the client.

New failure: the model picks a component that does not suit the content — a
table for a single value, a chart for two data points. The interface works and
still misleads.

## Layout

The model composes a tree of known primitives: this beside that, this collapsed
under that, in this order.

Output is still declarative data, but the space is combinatorial rather than
enumerable, so it can no longer be reviewed exhaustively. New failures are
arrangement failures — a legible interface arranged so the important part is
below the fold, or a nesting depth nobody anticipated.

## Behaviour

The model determines what happens on interaction: what this button does, what
this input validates, what this form submits.

This is the level where the output stops being describable as presentation. A
button's action is a capability, and a model deciding capabilities is deciding
what the user can be induced to do. Constraining it means enumerating allowed
actions — which is to say, coming back down to the component level for the
action vocabulary.

## Whole application

The model emits markup, styles, and script, and the host runs them.

Maximum expressiveness, and the only level where the security model has to
assume the output is hostile. The specification for interactive MCP interfaces
takes exactly this position for HTML content: sandboxed iframes with restricted
permissions, predeclared templates a host can review before rendering, and all
communication over an auditable channel rather than a shared global.

## The levels are not a ladder

They are a choice, and moving up one costs review capacity that is not recovered
by anything downstream.

A useful test: what would a person have to look at to be confident this
rendering is safe and correct? At the content level, the text. At the component
level, the component library, once. At the whole-application level, this
particular generated output — for every output, which nobody does, which is why
that level needs a sandbox instead of a review.

## What this means here

The MVP generates at the component level, with a fixed layout. The model
chooses among five card types and fills their fields; it does not arrange them,
define their behaviour, or emit markup.

Layout generation is the nearest boundary and the one most likely to be crossed
next, since arranging cards is a plausible thing to want. It would be a genuine
step: the output space stops being enumerable, and "we reviewed every possible
rendering" stops being true.
