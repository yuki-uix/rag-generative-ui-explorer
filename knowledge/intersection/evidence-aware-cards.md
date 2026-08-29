---
title: Evidence-aware knowledge cards
domain: intersection
tags:
  - evidence-aware-cards
summary: A card that carries its evidence is a different object from a card that was built from evidence, and the difference is what the reader can check.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Evaluating Verifiability in Generative Search Engines
    url: https://arxiv.org/abs/2304.09848
    author: Nelson F. Liu, Tianyi Zhang, Percy Liang
    published: 2023-04-19
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2304.09848. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    primary: true
---

# Evidence-aware knowledge cards

Most generative interfaces show a card built from retrieved data and then
discard the retrieval. The card is a rendering of an answer. An evidence-aware
card keeps the link: each field knows which passages produced it, and the reader
can traverse from any claim back to its source.

## Verifiability is not the presence of citations

The work this note is drawn from studied generative search engines — systems
that answer with prose plus citations — and found the surface reassuring and the
substance uneven. Responses were fluent and citation-bearing, and a substantial
share of individual statements were not supported by the sources cited next to
them.

The lesson generalises beyond search. **A citation is a claim about support, and
claims can be false.** An interface that displays citations has not thereby
become verifiable; it has become one that asserts verifiability. If nothing
checks the assertion, the visible citations make the output more persuasive
without making it more correct — the worst possible combination.

This is the specific reason a card interface is riskier than prose here. A card
looks systematic. Structure carries an implicit claim that the underlying
knowledge was structured, and a reader extends more trust to a table than to a
paragraph making the same claims.

## What "evidence-aware" has to mean to be worth anything

Three properties, and the third is the one usually missing.

**Every factual field references evidence.** Not the card, the field. A card
citing three passages tells the reader nothing about which passage supports
which cell.

**References are resolved, not displayed.** The server checks that each
identifier exists in the retrieval set for this generation before rendering. A
reference that cannot be resolved is a rejected response, not a broken link the
reader discovers.

**The excerpt shown comes from the corpus, not from the model.** If the source
drawer displays a passage the model reproduced, the reader is checking the
model's output against the model's output. The excerpt has to be fetched from
the stored chunk by identifier, which is also why identifier stability matters
beyond evaluation bookkeeping.

## Cheap traversal is the point

Verification that costs a page load, a new query, or a lost scroll position is
verification that does not happen. If checking a claim is expensive, readers
stop checking, and the interface's honesty becomes decorative.

This is why showing sources is a local interaction. It expands evidence already
present in the response, calls nothing, and preserves where the reader was. The
cheapest possible action to check the system's work is the design's most
important affordance, and it is the one most easily lost to an implementation
that regenerates on every interaction.

## What this means here

Cards are validated against their evidence before rendering; a card referencing
an identifier absent from the current retrieval set never reaches the browser.
Excerpts in the source drawer are stored corpus text, kept separate from
generated summaries.

The renderer never converts unverified model output into a card. That is a
grounding rule rather than an implementation preference, because the alternative
— rendering first and checking later — produces exactly the interface the
verifiability study describes: convincing, cited, and unchecked.
