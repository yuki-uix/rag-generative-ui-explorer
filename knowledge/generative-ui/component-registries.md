---
title: Component registries and tool-to-component mapping
domain: generative-ui
tags:
  - component-registries
summary: Mapping a model's structured output to reviewed components by a discriminator, and why the mapping must be a closed lookup rather than a dynamic resolution.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: Generative User Interfaces
    url: https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces
    author: Vercel
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    primary: true
  - sourceType: documentation
    title: "A2UI: Agent-to-User Interface"
    url: https://github.com/a2ui-project/a2ui
    author: A2UI Project contributors
    retrieved: 2026-08-29
    license: Apache-2.0. Short attributed quotations only; no publication date stated.
---

# Component registries and tool-to-component mapping

A component registry is the mapping from something the model emits to something
the application renders. It is a small piece of code and it is where the
security boundary of a generative interface actually lives.

## The shape of the pattern

The model calls a tool, or returns an object, carrying a discriminator — a tool
name or a `type` field. The application looks that discriminator up in a table
of reviewed components and renders the match, passing the validated payload as
props.

The pattern that current SDKs document is exactly this: define a tool, define
the component that renders its result, and let the framework connect them as
the result streams in. The declarative-intent protocols do the same across a
process boundary — the agent names a component and supplies data, the client
resolves the name against its own library.

The property that matters is the same in both: **the model names a component;
it does not supply one.**

## Closed lookup, not dynamic resolution

The distinction is easy to lose in implementation, and it is the whole point.

A closed lookup is a table with a known set of keys. An unknown key is an error
— the response is rejected, not rendered.

Dynamic resolution constructs the component from the model's output: importing
by path, indexing into a namespace, reading a name off a global. It looks
similar and it is a different system, because the set of reachable components
is no longer the set someone reviewed.

Three habits keep the lookup closed:

- The key set comes from an exported type or constant, not a hand-written list,
  so adding a component without wiring it fails the build rather than passing
  silently.
- An unknown discriminator throws rather than falling back to a generic
  renderer. A permissive fallback turns a detectable error into a rendering
  nobody designed.
- Props are validated against the component's schema before rendering, not
  spread in as whatever arrived.

## The registry is a vocabulary

Whatever is in the registry is what the interface can say. That has two
consequences pulling in opposite directions.

A small registry is reviewable, testable, and consistent, and it cannot express
things nobody anticipated. A large registry expresses more and stops being
reviewable in any meaningful sense — nobody audits a hundred components for
accessibility per release.

The registry also shapes the model's behaviour. Given only a table component, a
model will render prose as a table. The vocabulary is a set of affordances, and
affordances get used.

## What the registry cannot fix

Choosing the right component from a correct registry is a judgement the
registry does not make. A model that renders a definition as a comparison table
produces a valid, working, well-formed, misleading interface, and no amount of
registry discipline catches it.

That failure is only visible against a human expectation of what the right
presentation was — which is why card-type selection accuracy needs labelled
questions and cannot be derived from the output alone.

## What this means here

The discriminator set is already derived from the card union at runtime rather
than listed by hand, and that derivation is exported for downstream gates to
consume — a literal list would satisfy its type while missing a member, and go
stale silently.

The renderer that will map each discriminator to one reviewed React component
is M2 and not built. The design is that a coverage test iterates the exported
derivation, so a sixth card type cannot reach the renderer without a component
and a validation path, and that nothing constructs a component from model
output. The model produces a validated card specification, and the renderer
owns layout, tokens, accessibility, and interaction — the model's authority
ends at choosing a name and filling fields.