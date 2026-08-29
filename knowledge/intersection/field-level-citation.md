---
title: Claim-level and field-level citation
domain: intersection
tags:
  - field-level-citation
summary: Where a citation attaches decides what can be checked, and structured output makes the finest granularity enforceable rather than merely encouraged.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Measuring Attribution in Natural Language Generation Models
    url: https://arxiv.org/abs/2112.12870
    author: Hannah Rashkin, Vitaly Nikolaev, Matthew Lamm et al.
    published: 2021-12-23
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2112.12870. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    primary: true
  - sourceType: paper
    title: Enabling Large Language Models to Generate Text with Citations
    url: https://arxiv.org/abs/2305.14627
    author: Tianyu Gao, Howard Yen, Jiatong Yu et al.
    published: 2023-05-24
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2305.14627. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
---

# Claim-level and field-level citation

A citation is a claim that a particular statement is supported by a particular
source. Where it attaches determines what anyone — reader or validator — can do
with it.

## Attribution needs a unit to attribute

The framework this note is drawn from defines attribution as a property of a
specific statement relative to a specific source: whether, according to that
source, the statement holds. That framing requires two things a loose citation
does not supply — a delimited statement, and a delimited source.

"According to these five documents, here is a paragraph" satisfies neither. The
paragraph contains several statements of differing support, the five documents
say different things, and no assignment between them is recoverable.

## Granularity, and what each level permits

**Document level.** The answer names the sources consulted. A reader cannot tell
which sentence came from where; a validator can only confirm the documents were
retrieved. Nearly free, nearly useless.

**Sentence level.** Each sentence carries the passages supporting it. This is
what citation-generation work targets, and it is genuinely checkable: an
evaluator can ask whether the cited passages entail the sentence.

**Field level.** The unit is a field of a structured object — one key point, one
table cell, one step of a procedure. Available only when the output is
structured, and it is strictly stronger than sentence level for one reason: a
schema can *require* it.

## The property structure adds

In prose, a missing citation is a missing citation. Nothing distinguishes an
uncited sentence from a sentence the author judged not to need one, and
enforcement is a matter of prompting and hoping.

In a structured response, "every factual field carries at least one evidence
reference" is a shape property. A field without one is not a lapse in style; it
fails validation and does not render.

That converts a quality goal into a gate. The prompt still asks for grounded
output, because prompts express intent — but the property is re-established at
the output boundary, where it can be checked rather than requested.

Two further checks come free at that granularity. A referenced identifier must
resolve within the retrieval set for *this* generation, so a plausible-looking
but absent reference is rejected rather than displayed. And an unresolvable
reference must never be repaired by substituting a nearby one, which would turn
a detectable error into an undetectable one.

## What it cannot do

Field-level citation guarantees that every field points at retrieved evidence.
It does not guarantee that the evidence says what the field says.

A card citing a real passage that does not support its claim passes every
mechanical check. The reference resolves, the field is populated, the response
validates. Catching this needs entailment checking — model-graded, variable,
and not a substitute for the mechanical layer but an addition to it.

Worth stating the order plainly: mechanical checks first, because they are
determinate; model-graded checks second, because they are estimates. A
faithfulness score of 0.95 on a response citing an identifier that does not
exist is measuring the wrong thing.

## What this means here

Every factual field is an object carrying its text, its grounding mode, and at
least one evidence identifier — grounding is part of the grammar rather than an
annotation on top of it. Identifiers are resolved server-side against the
current generation's retrieval set, and unknown ones are rejected outright.

Citation completeness is measured at field level, and the exit criterion is that
100% of rendered factual fields reference valid retrieved evidence identifiers.
That is a determinate property, which is why it can be an exit criterion at all.
