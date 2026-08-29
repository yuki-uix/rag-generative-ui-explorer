---
title: "RAG motivation and core architecture"
domain: rag
tags:
  - rag-motivation
summary: "What problem retrieval-augmented generation was introduced to solve, the shape of the original architecture, and which of its claims still hold."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
    url: "https://arxiv.org/abs/2005.11401"
    author: "Patrick Lewis, Ethan Perez, Aleksandra Piktus et al."
    published: "2020-05-22"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2005.11401. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    primary: true
---

# RAG motivation and core architecture

A language model stores what it learned during training in its weights. That
store has three properties that make it awkward as a knowledge base: it cannot
be updated without retraining, it cannot cite where a claim came from, and it
fails silently — a model that does not know something produces fluent text
anyway.

Retrieval-augmented generation attaches a second, external store that the model
reads at inference time. The paper this note is drawn from named the pattern
and gave it its first end-to-end treatment.

## The distinction the paper draws

The framing that has outlasted the specific architecture is the split between
**parametric memory** — what the weights encode — and **non-parametric memory**
— an index the model queries when it answers.

Non-parametric memory can be edited without touching the model. Swap a document
and the system's answer changes. Delete one and the claims it supported go with
it. This is what makes RAG viable for knowledge that changes, and it is why the
corpus version matters as much as the model version when reproducing a result.

## The architecture

The original pipeline is short:

1. Encode the query. 2. Retrieve passages from a dense index. 3. Condition
generation on the query together with the retrieved passages.

Everything since has been elaboration on the middle step — hybrid retrieval,
reranking, query decomposition, iterative retrieval — plus scrutiny of what the
generator does with what it receives.

The paper also studied whether to marginalise over retrieved documents per
token or per sequence. That particular choice has not carried over into most
practical systems, which simply concatenate the retrieved passages into the
prompt. It is worth knowing the original design was more careful about it than
the systems that followed.

## What holds and what does not

**Holds:** external memory removes the retraining requirement for factual
updates, and grounding in retrieved text makes citation possible at all.
Neither is a small thing — without the second, an interface cannot honestly
show a source.

**Does not hold automatically:** that retrieval reduces hallucination.
Retrieval changes what the model has available; it does not compel the model to
use it, and it introduces a new failure mode where the model contradicts or
embellishes a passage it was given. Retrieved-and-ignored and
retrieved-and-misread are distinct from never-retrieved, and only the last is a
retrieval problem.

**Has aged:** the specific retriever. Dense-only retrieval was state of the art
in 2020. Hybrid retrieval with fusion is the current default, for reasons the
sparse-retrieval and candidate-fusion notes cover.

## What this means here

The parametric/non-parametric split is the reason this project's architecture
treats corpus text as untrusted input and requires every citation to be checked
against the retrieval set. If knowledge lives outside the model, the boundary
between the two is a trust boundary, and everything crossing it needs checking.
The checking itself is M3; what exists today is the schema that makes it
expressible.

It is also why "the corpus is insufficient" has to be an expressible answer. A
system whose knowledge is external can genuinely lack a fact, and saying so is
correct behaviour rather than a failure to try hard enough.