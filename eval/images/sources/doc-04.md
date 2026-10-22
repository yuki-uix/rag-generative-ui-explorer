---
title: "Reranking"
domain: rag
tags:
  - reranking-fusion
summary: "What a cross-encoder can judge that a dual encoder cannot, why reranking cannot improve recall, and how to decide whether it earns its latency."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "Passage Re-ranking with BERT"
    url: "https://arxiv.org/abs/1901.04085"
    author: "Rodrigo Nogueira, Kyunghyun Cho"
    published: "2019-01-13"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:1901.04085. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - cross-encoder-versus-dual-encoder
      - reranking-cannot-raise-recall
      - deciding-whether-it-is-worth-it
    primary: true
---

# Reranking

Reranking re-scores an already-retrieved candidate list by reading each
candidate together with the query. It is the second stage of a
retrieve-then-rank pipeline, and its value comes entirely from being allowed to
be expensive.

## Cross-encoder versus dual encoder

A dual encoder embeds the query and the passage independently. Whatever
interaction exists between them has to survive being compressed into two
vectors before they ever meet.

A cross-encoder concatenates query and passage and processes them together, so
every query term can attend to every passage term. It can notice that a passage
mentions the query's subject only in a list of related work, or that the
passage's central claim is the negation of what the query asks.

The price is that nothing can be precomputed. Scoring is one model call per
candidate, so a cross-encoder cannot search a corpus — it can only reorder a
list something cheaper produced. That constraint is the whole shape of the
architecture: cheap and broad first, expensive and precise second.

## Reranking cannot raise recall

This is the property most often stated wrongly, and it has consequences for how
results get reported.

A reranker reorders the candidates it was given. If the correct passage is not
in that set, no amount of reranking will produce it. Recall@K after reranking,
where K is the candidate count, is exactly Recall@K before it.

What does change is precision at small cutoffs. If ten chunks reach the model
out of a hundred candidates, reranking decides *which* ten, and nDCG improves
while recall over the full candidate set stays flat. Reporting only nDCG after
adding a reranker therefore suggests retrieval improved when retrieval did not
change at all.

The useful framing: retrieval determines what is *possible*, reranking
determines what is *sent*.

## Deciding whether it is worth it

Reranking adds latency linear in candidates, and it sits on the critical path
before generation can start. Three things decide whether it pays:

**How large the candidate set is.** Reranking 100 candidates to pick 10 has
room to work. Reranking 12 to pick 10 mostly reorders noise.

**How good the first stage already is.** A well-fused hybrid retriever leaves
less for a reranker to fix.

**Whether the downstream consumer is position-sensitive.** If all candidates go
into the prompt anyway, ordering still matters — evidence in the middle of a
long context is used least — but the effect is smaller than when a hard cutoff
discards everything below rank ten.

## What this means here

Reranking is specified as optional and is to be measured with the switch on and
off, holding the question set, corpus version, and configuration fixed. Both
arms are to report recall and ordering metrics separately, so an ordering
improvement is not read as a retrieval improvement. This is M1 and unbuilt.

The added latency and cost are to be measured on real runs rather than
projected. The decision to keep or drop it belongs to whichever configuration
the numbers support, and the numbers have to include what it costs, not only
what it improves.