---
title: Retrieval driven by UI actions
domain: intersection
tags:
  - ui-driven-retrieval
summary: Some interface actions need the model and some do not, and treating them alike is what makes a grounded interface slow and unreliable.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Principles of Mixed-Initiative User Interfaces
    url: https://erichorvitz.com/chi99horvitz.pdf
    author: Eric Horvitz
    published: 1999-05
    retrieved: 2026-08-29
    license: CHI 1999, pages 159-166, DOI 10.1145/302979.303030. Author-hosted copy; short attributed quotations only.
    primary: true
  - sourceType: documentation
    title: AG-UI Overview
    url: https://docs.ag-ui.com/
    author: AG-UI Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
---

# Retrieval driven by UI actions

A card is a starting point for exploration, not a final answer. That only holds
if acting on a card can fetch more evidence — which turns interface actions into
retrieval triggers, and requires deciding which actions deserve one.

## The division that matters

Actions fall into two kinds, and conflating them is the common mistake.

**Local.** Everything needed is already in the response. Expanding the evidence
behind a claim, switching a tab, collapsing a section. No new knowledge is
required, so no model call is justified.

**Agent.** New evidence is needed. Explaining a point in more depth, adding an
entity to a comparison.

Routing a local action through the model costs a round trip, spends money,
introduces variance into something that should be deterministic, and can produce
a *different answer* to a question the reader already had answered. A reader who
expands sources twice and sees different excerpts has learned that the interface
is not stable, which is expensive to unlearn.

The rule is worth stating as a rule: **a local interaction does not call the
model unless new reasoning or new retrieval is genuinely required** — and
"genuinely" means the answer is not already in the response object.

## A UI action is a better query than a rephrased question

When an agent action does fire, it starts from more than a text query. The
system knows which card was acted on, what it claimed, which evidence it already
used, and what kind of card it was.

"Explain further" on a comparison row is not the original question again. It is:
this dimension, these two entities, not the evidence already shown. That is a
narrower and better-specified retrieval than any rephrasing of the original
question, because the interface state supplies the narrowing.

This is the concrete payoff of the combination. In a prose interface the reader
must articulate the follow-up; in a card interface the structure articulates it,
and the reader only has to point.

## Constrained hops, not an autonomous loop

Iterative retrieval is a known pattern and it is usually autonomous: the model
decides it needs more, fetches, and repeats.

A UI-driven hop is different in one important respect — the reader decided.
Latency stays bounded, cost stays predictable, and two runs of the same
interaction remain comparable, which an autonomous loop cannot promise.

It also matches the mixed-initiative principle about efficient invocation and
termination: the automated service exists and the user asks for it, rather than
it deciding on their behalf. The event-based agent protocols encode the same
posture from the other direction, treating interrupts and steering as
first-class rather than as escapes from a pipeline.

## What a follow-up must not break

Two failures are easy to introduce and hard to notice.

**Replacing instead of appending.** Regenerating the whole response to add one
card discards the reader's state by construction, and it also re-answers parts
they were satisfied with — inviting an inconsistency between what they read a
moment ago and what is now on screen.

**Validating against the wrong retrieval set.** New cards must have their
evidence identifiers checked against the *new* generation's set. Reusing the
previous set would let a follow-up cite evidence it never retrieved.

## What this means here

Three actions, split deliberately. Showing sources is local and a test asserts it
makes no model call. Explaining further runs a narrower retrieval scoped to the
selected card and appends cards. Adding to comparison retrieves the new entity
and extends the comparison card.

Every transformation from card state to query is logged with its input and
output, because "the narrowing was wrong" and "retrieval missed" look identical
at the output and are entirely different bugs.
