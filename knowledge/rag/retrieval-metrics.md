---
sourceType: paper
title: IR evaluation methods for retrieving highly relevant documents
domain: rag
tags:
  - rag-evaluation
summary: What Recall@K, MRR, and nDCG each measure, why graded relevance was introduced, and which metric answers which question about a retriever.
url: https://sigir.org/wp-content/uploads/2017/06/p243.pdf
author: Kalervo Jarvelin and Jaana Kekalainen
published: 2000-07
retrieved: 2026-08-29
license: "SIGIR 2000, Athens. Reprinted in ACM SIGIR Forum 51(2), July 2017, from which this copy is taken. Short attributed quotations only."
---

# Retrieval metrics

Retrieval is evaluated separately from generation, and for a specific reason: a
well-presented answer built on the wrong evidence looks better than a plainly
presented answer built on the right evidence. Measuring the two together lets
presentation quality hide retrieval failure.

## Recall@K

The fraction of relevant documents that appear in the top K results.

This is the metric that matters most for a RAG pipeline, because K is set by the
context budget. If the correct evidence is not in the K chunks handed to the
model, nothing downstream can recover it — no reranker, no prompt, no larger
model. Every other stage can only lose information that retrieval already found.

Recall@K ignores where in the top K the evidence landed. That is appropriate
when all K chunks reach the model anyway, and inappropriate as soon as a
reranker or a context budget truncates the list.

## Mean reciprocal rank

The reciprocal of the position of the first relevant result, averaged over
queries. A first-position hit scores 1, second scores 0.5, tenth scores 0.1.

MRR asks "how quickly does the user reach something useful", which makes it a
good match for interfaces where a person scans a list. It is a poor match for
questions needing several pieces of evidence, because it stops caring after the
first hit — a retriever that finds one of four required chunks at rank 1 scores
perfectly.

## Graded relevance and nDCG

Recall and MRR both treat relevance as binary. The paper this note is drawn from
argues that binary judgements throw away something real: documents are not
equally relevant, and an evaluation that cannot distinguish a direct answer from
a passing mention will rank two very different systems the same.

Its proposal is cumulated gain — sum the graded relevance of the results in rank
order — then discount each position logarithmically so that gain arriving later
counts for less, then normalise against the ideal ordering so scores are
comparable across queries with different numbers of relevant documents. That
last step is what makes it *normalised* DCG.

nDCG is the most informative of the three and the most expensive to produce,
because it needs graded judgements rather than a yes/no list. For a corpus with
sixty hand-written evaluation questions, grading is a real cost and worth
deciding on deliberately.

## Choosing among them

They answer different questions and should not be treated as interchangeable:

- **Recall@K** — is the evidence available at all? Report this first.
- **MRR** — how far must someone read before the first useful thing?
- **nDCG** — is the ordering good, given that some evidence is better than
  other evidence?

A pipeline can improve on one and regress on another. Reranking often raises
nDCG while leaving Recall@K exactly unchanged, because reranking reorders the
candidate set without adding to it. Reporting only nDCG in that situation
suggests retrieval improved when it did not.

## What this means here

Recall@K on the evaluation set is the gate. If it is low, every generative-UI
metric measured on top of it is describing how well the system presents evidence
it never found.

Because the evaluation questions carry golden evidence IDs, Recall@K and MRR are
computable without further judgement work. nDCG needs graded labels that do not
exist yet, so it is either a deliberate additional labelling pass or it is not
reported — reporting an nDCG derived from binary labels would just be Recall@K
wearing a more impressive name.
