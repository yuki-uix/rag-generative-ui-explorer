---
sourceType: paper
title: Query Rewriting for Retrieval-Augmented Large Language Models
domain: rag
tags:
  - query-transformation
summary: Rewriting, decomposing, and expanding a question before retrieval, and why each extra transformation is a place the pipeline can lose the user's actual intent.
url: https://arxiv.org/abs/2305.14283
author: Xinbei Ma, Yeyun Gong, Pengcheng He, Hai Zhao et al.
published: 2023-05-23
retrieved: 2026-08-29
license: "arXiv preprint, arXiv:2305.14283. Non-exclusive licence to distribute; short attributed quotations only."
---

# Query rewriting, decomposition, and expansion

The question a person asks and the text that answers it are written by different
people for different purposes. Query transformation is the set of techniques
that close that gap before retrieval runs.

## Why the raw question underperforms

Real questions carry things retrieval cannot use. They refer to earlier turns
("what about the second one?"), they include framing that is not content ("I'm
new to this, can you explain..."), and they use the asker's vocabulary rather
than the corpus's.

The observation behind this note is that the gap can be closed from the query
side: rather than accepting the question as fixed and improving the retriever,
rewrite the question into something the retriever handles better. Placing a
rewriting step in front of a frozen retriever and a frozen generator improved
results without touching either.

## The three transformations

**Rewriting** produces one better query from one query. Resolving pronouns
against the conversation, dropping conversational framing, substituting the
corpus's terminology for the asker's. This is the cheapest and the most reliably
useful.

**Decomposition** produces several queries from one. "How does hybrid retrieval
differ from reranking, and which should I add first?" contains two questions with
different evidence needs; retrieving once for the concatenation tends to return
material that is mediocre for both. Decomposition matters most for comparison
questions, which for this project is not an edge case — comparison is one of the
five card types.

**Expansion** adds terms rather than replacing them: synonyms, spelled-out
acronyms, related terminology. A variant generates a hypothetical answer and
retrieves against *that*, on the argument that an answer resembles the passages
that contain it more than a question does.

## What each one can break

Every transformation is a place where the user's intent can be lost, and the
loss is invisible downstream — retrieval returns confident results for the
rewritten query, and nothing indicates the rewrite was wrong.

**Rewriting** can discard the distinguishing word. "Retrieval *without*
reranking" rewritten to "retrieval and reranking" inverts the question.

**Decomposition** can split something that was only meaningful whole, and it
multiplies retrieval cost by the number of sub-queries.

**Expansion** dilutes. Adding six synonyms to a three-word query means the
original terms carry a quarter of the weight they did, and a precise query
becomes a vague one.

All three add a model call before retrieval, on the critical path, where it is
felt directly in time to first content.

## Keeping the original

The mitigation that costs least is not choosing. Retrieve with the original
query as well as the transformed ones and fuse the results. A rewrite that
helped contributes; a rewrite that destroyed the question is outvoted by the
original.

This composes with hybrid retrieval, since both end at the same fusion step, and
it means a bad rewrite degrades results rather than replacing them.

## What this means here

Rewriting and decomposition are in scope; the pipeline classifies or decomposes
a question into retrieval intents before retrieving. Expansion is not, because
this corpus's vocabulary is small and controlled, and dilution is the more
likely outcome.

Every transformation is logged with its input and output. A retrieval failure
has to be attributable to the stage that caused it, and "the rewrite changed the
question" and "the retriever missed" are indistinguishable at the output while
being entirely different bugs.
