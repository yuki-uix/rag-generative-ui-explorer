---
sourceType: paper
title: Dense Passage Retrieval for Open-Domain Question Answering
domain: rag
tags:
  - retrieval-strategies
summary: How a dual-encoder retriever matches meaning rather than words, what training it requires, and why it is complementary to lexical search rather than a replacement.
url: https://arxiv.org/abs/2004.04906
author: Vladimir Karpukhin, Barlas Oguz, Sewon Min, Patrick Lewis et al.
published: 2020-04-10
retrieved: 2026-08-29
license: "arXiv preprint, arXiv:2004.04906. Non-exclusive licence to distribute; short attributed quotations only."
---

# Dense retrieval

Dense retrieval represents queries and passages as vectors in a learned space
and retrieves by proximity. Where lexical retrieval asks which documents contain
these words, dense retrieval asks which passages mean something close to this.

## The dual encoder

Two encoders, one for questions and one for passages. Passages are encoded once
at ingest and stored; a query is encoded at request time and the nearest
passages are returned by vector similarity.

The asymmetry is what makes it practical. Encoding the corpus is a one-off cost
paid at ingest, and search is a nearest-neighbour lookup rather than a model
call per candidate. This is exactly what a cross-encoder cannot do — it must see
the query and the passage together, so it cannot precompute anything, which is
why cross-encoders end up in the reranking stage rather than the retrieval one.

The paper's central practical result was that the encoders can be trained with a
modest number of question-passage pairs and still beat a strong lexical baseline
on open-domain QA. Before it, the assumption was that dense retrieval needed far
more supervision to be competitive.

## What training is doing

The training objective pulls a question and its correct passage together and
pushes incorrect passages apart. Which incorrect passages you choose matters a
great deal: random passages from the corpus are easy to separate and teach
little, while passages that are lexically similar but wrong are what force the
encoder to learn a useful distinction.

The consequence for anyone using an off-the-shelf embedding model is that the
model encodes the notion of similarity it was trained on. A model trained on web
question-answer pairs and a model trained on scientific abstracts disagree about
what "close" means, and neither is right in general.

## The dependency nobody sees until it moves

The index is a function of the embedding model. Change the model — a version
bump, a different provider, a dimensionality change — and every stored vector is
stale. There is no partial migration: old and new vectors are not comparable, so
the corpus has to be re-embedded in full.

This makes the embedding model and its version part of the corpus identity, not
a configuration detail. An evaluation result recorded without it cannot be
reproduced.

## Where it fails

The failures are the mirror image of BM25's.

**Rare and out-of-vocabulary terms.** An exact identifier, a version number, a
newly coined term — the model has no useful representation, so it retrieves
things that are topically nearby and lexically unrelated.

**Negation and small distinguishing words.** "Retrieval with reranking" and
"retrieval without reranking" embed close together. The difference that matters
most to the reader is the one the representation compresses away.

**Opacity.** When lexical retrieval misses, you can see which term failed to
match. When dense retrieval misses, the answer is that the vectors were not
close, which is not a diagnosis.

## What this means here

This corpus is dense with exact terminology, which is dense retrieval's weakest
case and lexical retrieval's strongest. It is also full of paraphrase between
how a note is written and how a question is asked, which is the reverse.

That is the argument for running both and fusing, and for reporting each arm's
Recall@10 separately as well as the fused result. If the fused system does not
beat the better single arm, the fusion is not earning its complexity, and the
per-arm numbers are the only way to notice.
