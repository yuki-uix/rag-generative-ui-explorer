---
sourceType: paper
title: "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks"
domain: rag
tags:
  - embeddings-similarity
summary: Why a sentence embedding needs training for the comparison it will be used for, and what cosine similarity does and does not tell you about two passages.
url: https://arxiv.org/abs/1908.10084
author: Nils Reimers and Iryna Gurevych
published: 2019-08-27
retrieved: 2026-08-29
license: "arXiv preprint, arXiv:1908.10084. Non-exclusive licence to distribute; short attributed quotations only."
---

# Embeddings and similarity measures

An embedding maps text to a fixed-length vector so that comparison becomes
arithmetic. Everything about whether that comparison is meaningful depends on
how the mapping was trained.

## Embeddings are trained for a comparison

The observation behind this note is that a strong language model does not
automatically give you useful sentence vectors. Averaging the token
representations of an untuned BERT produced sentence embeddings that performed
poorly on similarity tasks — in some settings worse than far simpler methods.

The fix was to train the encoder on the comparison itself: pairs of sentences
with a known relationship, optimised so that related pairs land close together.
The architecture matters less than the objective.

Two things follow that matter in practice.

**"Similar" is whatever the training data said it was.** An embedding trained on
question-answer pairs places a question near its answer. One trained on
paraphrase pairs places a sentence near its restatement. These are different
geometries, and a question and its answer are often *not* paraphrases — they
share little vocabulary and differ in form. Using a paraphrase model for
retrieval quietly asks the wrong question.

**Asymmetry has to be modelled deliberately.** Retrieval compares a short query
to a long passage. If both go through the same encoder trained on symmetric
pairs, the length and register mismatch is left for the geometry to absorb.

## Cosine similarity and what it does not say

Cosine similarity measures the angle between two vectors, ignoring magnitude. It
is the standard choice, and its behaviour is easy to misread.

**The scale is not calibrated.** In most embedding spaces, unrelated text scores
around 0.6–0.7 and closely related text around 0.85–0.95. The usable range is a
narrow band near the top, and a "similarity of 0.8" means nothing without knowing
the model's distribution. A threshold transplanted from one model to another is
arbitrary.

**It is not comparable across models**, which is the same point in a form that
bites during upgrades: a relevance cutoff tuned for one embedding model is not
merely suboptimal for the next one, it is meaningless.

**It is not comparable across queries.** Two documents' scores against different
queries say nothing about each other. This is precisely why fusion should use
rank position rather than score.

## Dimensionality and cost

Larger vectors capture more and cost more — in storage, in index size, and in
comparison time. Many current models support truncating their output to a
shorter prefix with modest quality loss, making dimensionality a tunable rather
than a fixed property.

At this corpus's scale, none of it matters much: thirty to fifty notes is a few
thousand chunks, and exhaustive comparison in memory is fast. Approximate
nearest-neighbour indexes exist to avoid a linear scan over millions of vectors,
and adopting one here would add a recall-versus-speed trade-off in exchange for
speed that is not needed.

## What this means here

The embedding model and its version belong in the corpus identity, because
changing either invalidates every stored vector and every threshold derived from
them.

Similarity scores are used for ordering and never shown as confidence. A card
saying a source is "0.87 relevant" would imply a calibration that does not
exist — and for a system whose whole argument is that it does not overstate its
evidence, that is exactly the wrong number to put on screen.
