---
title: Declarative UI schemas and UI grammars
domain: generative-ui
tags:
  - declarative-ui-schemas
summary: Describing an interface as validated data rather than code, what a schema can and cannot constrain, and why the renderer keeps authority over presentation.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: "A2UI: Agent-to-User Interface"
    url: https://github.com/a2ui-project/a2ui
    author: A2UI Project contributors
    retrieved: 2026-08-29
    license: Apache-2.0. Short attributed quotations only; no publication date stated.
    supports:
      - intent-not-appearance
      - grammar-size
    primary: true
  - sourceType: documentation
    title: Adaptive Cards
    url: https://adaptivecards.io/
    author: Microsoft
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - intent-not-appearance
  - sourceType: documentation
    title: JSON Schema
    url: https://json-schema.org/
    author: JSON Schema organization
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - what-a-schema-can-enforce
---

# Declarative UI schemas and UI grammars

A declarative UI schema describes an interface as data: a document saying what
should appear, validated before anything renders. It is the mechanism that lets
a model participate in an interface without emitting code.

## Intent, not appearance

The idea predates agents. Card formats have carried interface descriptions
between a producer and a host for years, on the premise that the producer says
what it wants shown and the host decides how it looks in its own surface.

The declarative agent-UI format takes the same position explicitly: agents send
a JSON description of the *intent* of the UI, and the client renders it with
its own component library — Flutter, Angular, Lit, whatever the host happens to
be.

The separation is what makes the arrangement safe across a trust boundary. If
the description carried appearance, a remote producer could make its content
look like the host's own chrome. Because it carries intent, the host's
rendering of a "confirm" is the host's confirm.

## What a schema can enforce

Validation is a real gate and it has real limits. Worth being precise about
both, because the limits are where the interesting failures live.

**A schema enforces shape.** Which fields exist, their types, allowed values,
bounds on collections, and — where the format is a discriminated union — that
the node is one of a known set of kinds. An unknown kind fails.

**A schema does not enforce coherence.** A comparison with three entities and
two values per row can be perfectly valid and renders misaligned. A step list
whose steps are in the wrong order validates. Cross-field rules of this sort
are generally unrepresentable in JSON Schema, which means they must be checked
somewhere else, and that somewhere else has to be treated as part of the
contract rather than as an implementation detail.

**A schema does not enforce sense.** Nothing in a valid document says the
chosen presentation suits the content.

The practical consequence: a schema plus a runtime validator that can express
what the schema cannot, with the second treated as authoritative. If the two
disagree in strength, the gap has to be enumerated rather than assumed away.

## Grammar size

A UI grammar can be tiny — five card types with fixed fields — or it can
approach a general layout language with containers, spacing, and conditionals.

The larger it gets, the more it resembles a programming language whose
interpreter you now maintain, and the fewer of its expressible documents anyone
has looked at. A grammar that can express a hundred million interfaces has been
reviewed for approximately none of them.

Small grammars fail by being unable to express something. Large grammars fail
by expressing something nobody intended. The first failure is visible at
authoring time; the second is visible to a user.

## What this means here

The response envelope is a discriminated union over five card types, with a
`type` field selecting the shape. Every factual field is an object carrying its
text, how that text relates to its sources, and the evidence identifiers
supporting it — grounding is part of the grammar rather than an annotation
layered on top.

The grammar deliberately contains no layout, styling, or behaviour. There is no
container node, no spacing, no conditional. That constraint is what keeps
"every possible rendering has been reviewed" a true statement rather than an
aspiration.