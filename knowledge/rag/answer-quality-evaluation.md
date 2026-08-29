---
title: "Answer quality evaluation"
domain: rag
tags:
  - rag-evaluation
  - grounded-generation
summary: "Decomposing RAG answer quality into faithfulness, answer relevance, and context relevance, and what a model-graded metric can and cannot be trusted to tell you."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "Ragas: Automated Evaluation of Retrieval Augmented Generation"
    url: "https://arxiv.org/abs/2309.15217"
    author: "Shahul Es, Jithin James, Luis Espinosa-Anke et al."
    published: "2023-09-26"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2309.15217. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    primary: true
---

# Answer quality evaluation

Retrieval metrics say whether the evidence was found. They say nothing about
what the generator did with it. A pipeline can score perfectly on Recall@10 and
still produce an answer that contradicts the retrieved passages.

## Three questions, not one

The decomposition this note is drawn from separates answer quality into
components that fail independently:

**Faithfulness** — is every claim in the answer supported by the retrieved
context? This is the hallucination measure. It is computed by breaking the
answer into individual statements and checking each against the context, which
matters: an answer that is 90% grounded and 10% invented is not 90% correct,
and a whole-answer judgement tends to round it up.

**Answer relevance** — does the answer address the question that was asked? An
answer can be perfectly faithful to the context and still not respond to the
question, particularly when retrieval returned something adjacent.

**Context relevance** — was the retrieved context actually needed? This catches
the retriever that achieves recall by returning everything. Sending twenty
chunks where three would do inflates recall while degrading the answer, for the
reasons the context-assembly note covers.

The decomposition is the durable contribution. A single "quality" score
conflates three failures that call for three different fixes: better retrieval,
better query understanding, and less context.

## The metrics are model-graded

All three are computed by prompting a language model. That makes them cheap
enough to run on every change, and it makes them fallible in ways a mechanical
metric is not:

- They vary between runs. A single number without dispersion across repetitions
  is not a measurement.
- They vary with the grading model, its version, and the grading prompt. Two
  numbers produced under different graders are not comparable, and the grader
  therefore has to be pinned and recorded alongside the result.
- They can be wrong in correlated ways. A grader sharing the generator's
  blind spots will rate a confidently wrong answer highly.

None of this makes them useless. It makes them a signal to be tracked over time
under fixed conditions, not a ground truth to be quoted as a percentage.

## Mechanical checks come first

Some of what these metrics approximate can be checked exactly.

Whether every factual field carries an evidence reference is a structural
property — it is either true of the response or it is not, and no grader is
needed. Whether each cited identifier exists in the retrieval set for that
generation is likewise a lookup.

Those checks are determinate and cheap, and they should run before any
model-graded metric. A model-graded faithfulness score of 0.95 on a response
that cites an evidence ID which does not exist is measuring the wrong thing
entirely.

## What this means here

Faithfulness and context relevance are worth tracking, with the grading model
and prompt version recorded in the run, and dispersion reported across
repetitions.

But the exit criteria lean on the mechanical checks — every factual field
references a valid retrieved evidence ID, no unresolvable citation reaches the
renderer — because those are the ones that can be stated as facts rather than
as estimates.