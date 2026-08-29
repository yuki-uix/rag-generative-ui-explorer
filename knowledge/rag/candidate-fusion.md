---
title: "Candidate fusion"
domain: rag
tags:
  - reranking-fusion
  - retrieval-strategies
summary: "Why reciprocal rank fusion combines retrievers using rank position rather than score, and what that buys over score normalisation."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
    url: "https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf"
    author: "Gordon V. Cormack, Charles L. A. Clarke, and Stefan Buettcher"
    published: "2009-07"
    retrieved: "2026-08-29"
    license: "SIGIR'09, July 19-23 2009, Boston. Copyright 2009 ACM. Author-hosted copy; short attributed quotations only."
    primary: true
---

# Candidate fusion

Running two retrievers gives you two ranked lists. Fusing them means producing
one list that is better than either — and the difficulty is that the two lists
are not measured in comparable units.

## The problem with combining scores

A BM25 score is an unbounded sum over query terms. A cosine similarity is
bounded in a narrow band, typically clustered between 0.7 and 0.9 for anything
plausibly related. Adding them directly means BM25 decides everything. Scaling
them to a common range is worse than it looks: min-max normalisation depends on
the extreme values that happen to appear in this result set, so the same
document gets a different normalised score depending on what else was retrieved
alongside it.

Score distributions also shift with query length, corpus size, and embedding
model version. A weighting tuned on one configuration silently stops being
correct when any of those change.

## Reciprocal rank fusion

Reciprocal rank fusion discards the scores and uses only the rank position. Each
document receives, from each list, a contribution of `1 / (k + rank)`, and the
contributions are summed. Documents appearing high in several lists accumulate
the most.

Two properties follow from this shape:

**It is scale-free.** Rank position is comparable across retrievers by
construction, so nothing needs normalising and nothing needs retuning when a
retriever is swapped out.

**The constant flattens the top.** `k` — conventionally 60 — damps the
difference between rank 1 and rank 2 relative to the difference between rank 1
and rank 20. A single retriever that is confidently wrong at rank 1 cannot
dominate the fused list on its own; agreement across retrievers matters more
than any one retriever's certainty.

The cost is that genuine confidence is discarded along with the incomparable
scores. A retriever that is right and knows it is right gets no extra weight.
In practice the robustness has been the better trade, which is the paper's
central claim.

## Fusion is not reranking

The two are often run together and are easy to conflate.

Fusion merges several ranked lists using only their positions. It is cheap,
deterministic, and knows nothing about the query beyond what the retrievers
already decided.

Reranking re-scores a *single* candidate list by reading each candidate against
the query, usually with a cross-encoder. It is far more expensive per candidate
and can only reorder what fusion handed it.

The order matters: fusion runs first so the reranker sees candidates from every
retriever. Reranking each list separately and then fusing would throw away the
reranker's ability to compare a lexical hit against a semantic one.

## What this means here

Fusion is where a hybrid retriever stops being two systems and becomes one, and
it is the last stage that is fully deterministic. Everything before it can be
replayed exactly; everything after it involves a model.

That makes the fused list a good place to snapshot for evaluation. Recorded
before reranking, it separates "the candidate was never retrieved" from "the
candidate was retrieved and then ranked away" — two failures that look identical
at the output but call for entirely different fixes.
