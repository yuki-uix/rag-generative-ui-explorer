---
title: Predictability and user control
domain: generative-ui
tags:
  - genui-quality-attributes
summary: An interface that varies per response cannot be learned, and visual authority that exceeds the underlying evidence is a failure the user cannot see.
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
    title: Malleable Software
    url: https://www.inkandswitch.com/malleable-software/
    author: Ink & Switch
    retrieved: 2026-08-29
    license: Research programme page; no author or publication date stated. Short attributed quotations only.
---

# Predictability and user control

Conventional interfaces are learnable because they are stable. The button is
where it was yesterday. Generated interfaces trade that away, and the trade is
rarely made explicitly.

## Learning requires repetition

A user builds a model of an interface by using it. Skills transfer between
sessions because the interface is the same interface.

An interface generated per response denies that. Two similar questions can
produce different structures, and the reader starts over each time — where are
the sources, is this expandable, what does this control do. The cost is small
per response and paid on every response, which is the shape of cost people
underestimate.

Worse, variation carries no information. When a table appears for one question
and prose for another, the reader reasonably infers a reason. If there is no
reason — if the model simply chose differently — the interface has taught them
something false.

Consistency is therefore not aesthetic tidiness. It is the mechanism by which an
interface becomes cheap to use, and a system that varies without meaning is
spending the user's attention to no purpose.

## Control has to be cheap and obvious

The principles this note draws on include providing efficient ways to invoke and
terminate an automated service, and designing so that a poor guess costs little
to recover from.

Applied to presentation: if the model chose the wrong form, how does the reader
get a different one? If the answer is "rephrase the question and hope", the
system has offered no control at all — it has offered resampling.

The distinction that matters is between control over *content* and control over
*presentation*. Asking a follow-up question changes the content and hopes the
presentation follows. Being able to say "show me this as a list" is control over
presentation, and it is separable — a presentation change need not go back to
the model, because the underlying evidence has not changed.

The malleability argument extends this: a user who can adapt their tool has real
control, and their adaptation is the durable artefact. A user who can only
resubmit does not.

## Visual authority is a claim

This is the failure specific to interfaces that present evidence.

A comparison table asserts that the entities are comparable along these
dimensions and that the values are known. A four-row table built from two thin
passages and two inferences makes all four assertions with identical visual
weight. Nothing in the rendering distinguishes the well-supported cell from the
speculative one.

Prose, awkwardly, is better at this. A writer can hedge mid-sentence. A table
cell cannot hedge; it either has content or it does not, and content in a cell
reads as fact.

Structured presentation therefore has to carry its own uncertainty explicitly —
by labelling what kind of claim each field is, by making an inference visibly
different from an extract, and by being willing to render nothing where nothing
is supported.

## What this means here

Presentation-only interactions stay in the browser: showing sources does not
call the model, so the cheapest correction is also the cheapest to perform and
never resamples the answer.

Every factual field carries how it relates to its sources — extracted,
summarised, or inferred — and inferred content is rendered visibly differently.
A response can also mark itself incomplete, with a reason distinguishing missing
evidence from conflicting evidence, so weak support is stated rather than
smoothed into a confident-looking card.

The variation itself is measured. Consistency is a named metric, and an
unnecessary-card rate exists because a card that adds nothing still costs the
reader the effort of working out that it adds nothing.
