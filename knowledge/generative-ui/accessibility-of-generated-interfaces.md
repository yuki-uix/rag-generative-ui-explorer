---
title: Accessibility of generated interfaces
domain: generative-ui
tags:
  - genui-quality-attributes
summary: Why accessibility is a property of the component vocabulary rather than of any individual generated rendering, and what that implies about where it is enforced.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: specification
    title: Accessible Rich Internet Applications (WAI-ARIA) 1.2
    url: https://www.w3.org/TR/wai-aria-1.2/
    author: W3C
    published: 2023-06-06
    retrieved: 2026-08-29
    license: W3C Recommendation, 06 June 2023. W3C Document Licence; short attributed quotations only.
    supports:
      - semantics-are-what-assistive-technology-reads
      - why-the-level-of-generation-decides-the-outcome
    primary: true
  - sourceType: documentation
    title: ARIA Authoring Practices Guide
    url: https://www.w3.org/WAI/ARIA/apg/
    author: W3C Web Accessibility Initiative
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - semantics-are-what-assistive-technology-reads
      - what-generation-still-breaks-in-a-bounded-vocabulary
---

# Accessibility of generated interfaces

Accessibility is the quality attribute that degrades most sharply as generation
moves up the levels, and it is the one least visible to the person building the
system.

## Semantics are what assistive technology reads

The accessibility model of the web is a parallel tree of roles, states, and
properties, derived from markup and exposed to assistive technology. A screen
reader does not see a layout; it sees that this is a table with these headers,
this is a button in this state, this region is live and just changed.

The specification defines that vocabulary, and the accompanying practice guide
defines the patterns — which roles compose, which keyboard interactions each
pattern owes the user, which states must be kept in sync.

The essential point for generated interfaces: **these semantics are not implied
by appearance**. A grid of divs that looks like a table conveys nothing to a
screen reader. Two interfaces that render identically can be entirely usable
and entirely unusable.

## Why the level of generation decides the outcome

At the component level, accessibility is a property of the component library. A
reviewed table component is a table every time it renders — for the first
response and the ten-thousandth — because it was built once, tested once, and
is reused. The audit is finite and it holds.

At the markup-generation level, accessibility is a property of each output.
There is no floor: the same prompt can produce a well-labelled form and an
unlabelled one, and neither is more "correct" from the generator's point of
view. Auditing per instance is not a thing anyone does.

This is the strongest practical argument for a bounded vocabulary, and it does
not depend on any claim about how good models are at accessibility. Even a
generator that produced accessible markup ninety-nine times in a hundred leaves
a hundredth reader with an unusable interface and no recourse, and nobody
watching knows which reader it was.

## What generation still breaks in a bounded vocabulary

A reviewed vocabulary is necessary and not sufficient. Three things go wrong
even when every component is sound.

**Dynamic insertion without announcement.** Content that appears after a
follow-up needs a live region, or a screen-reader user does not learn it
arrived. The components are fine; the composition is not.

**Focus loss on regeneration.** If focus sits inside a card that is replaced,
focus falls back to the document body and the reader's position is gone. This
is the accessibility face of state continuity, and it is more damaging here — a
sighted reader loses their place, a keyboard user loses their ability to
continue.

**Meaning carried only by arrangement.** If two cards are related because they
sit side by side, that relationship exists visually and nowhere else.

## What this means here

The renderer is specified to own keyboard and screen-reader behaviour for the
whole vocabulary rather than per response: comparison cards using real table
semantics with headers associated to cells, every interaction reachable by
keyboard alone including the source drawer, and focus managed when the drawer
opens and closes. The renderer is M2 and is not built.

Accessibility is a named success metric for the comparative evaluation, not a
checklist item. The point of measuring it is the possibility of finding that
dynamic cards are *worse* on it than a Markdown baseline — plain prose is
strongly accessible by default, and an interface that trades that away for
structure has to be shown to be paying for something.