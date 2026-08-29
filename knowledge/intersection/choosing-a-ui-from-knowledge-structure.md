---
title: Choosing a UI from knowledge structure
domain: intersection
tags:
  - ui-from-knowledge-structure
summary: Retrieved evidence has a shape, and the claim under test is that the shape should determine the presentation rather than the question's phrasing.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Enabling Large Language Models to Generate Text with Citations
    url: https://arxiv.org/abs/2305.14627
    author: Tianyu Gao, Howard Yen, Jiatong Yu et al.
    published: 2023-05-24
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2305.14627. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    primary: true
---

# Choosing a UI from knowledge structure

The premise of this project is that retrieved evidence has a structure, that
the structure is recoverable, and that presentation should follow from it. Each
of those three is a claim that could be false, and they fail in different ways.

## Two signals, and they disagree

There are two places a presentation decision could come from.

**The question.** "What is X" wants a definition, "how does X work" wants a
mechanism, "X versus Y" wants a comparison. Cheap to classify and usually right.

**The evidence.** Passages that each describe one entity along shared dimensions
are comparison-shaped whatever the question was. Passages describing ordered
stages are mechanism-shaped. A single passage defining a term is
definition-shaped.

Most of the time they agree, and the interesting cases are the disagreements.

A reader asks "what is reranking" — a definition question — and retrieval
returns four passages that all contrast it with fusion. Answering the question's
shape gives a definition that discards the contrast the corpus actually
contains. Answering the evidence's shape gives a comparison to something the
reader has not asked about.

Neither is obviously right, and a system has to pick one. Deciding from the
evidence is the more defensible default for a corpus-grounded tool: presenting
what the corpus has is more honest than presenting what the question implied it
would have.

## When the evidence has no usable shape

Retrieval frequently returns four unrelated passages that each touch the topic.
That is not a structure; it is a pile.

The failure mode to avoid is imposing one anyway. Four unrelated passages can be
forced into a comparison table with four rows, and the result asserts a
comparability that nothing supports. The table is not merely unhelpful, it makes
a claim.

The correct output is the least structured one — an evidence list, or an
explicit statement that the corpus does not answer this — and a system that
cannot produce that will produce a confident-looking table instead.

## Structure is not in the text

The evidence carries no explicit shape. A retrieved chunk is prose; whether it
belongs in a comparison is an inference from its content and its relationship to
the other chunks.

That inference is made by the same model that then populates the card, which
means presentation errors and content errors have a common cause. A model that
misreads two passages as contrasting will build a comparison *and* fill it
wrongly, and the two failures will not look independent in the results.

## What the citation work suggests about the harder version

Work on generating text with citations frames the task as producing statements
each attributed to specific retrieved passages, and evaluates fluency, factual
correctness, and citation quality as separate axes rather than one score.

Applied here, the separation is the useful part. A card can be well chosen and
badly filled, badly chosen and well filled, or well cited and wrong about which
evidence supports which field. Reporting a single "quality" number would let a
good score on one axis conceal a failure on another — which is exactly the
attribution that the four-arm evaluation exists to preserve.

## What this means here

The planner receives the reranked evidence and the question, and selects among
five card types. Card-type selection accuracy is measured against expected types
labelled per question in advance, as a set rather than a single value, because
several questions legitimately admit more than one good presentation.

The unnecessary-card rate exists for the opposite failure: a card that adds
nothing still costs the reader the work of discovering that it adds nothing.
Producing fewer cards is a success condition, not a shortfall.
