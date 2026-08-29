---
title: "Sparse retrieval"
domain: rag
tags:
  - retrieval-strategies
summary: "How BM25 scores a document against a query, why term saturation and length normalisation matter, and where lexical retrieval still beats embeddings."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "The Probabilistic Relevance Framework: BM25 and Beyond"
    url: "https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf"
    author: "Stephen Robertson and Hugo Zaragoza"
    published: "2009"
    retrieved: "2026-08-29"
    license: "Foundations and Trends in Information Retrieval 3(4), DOI 10.1561/1500000019, (c) 2009 the authors and Now Publishers. Author-hosted copy; short attributed quotations only."
    primary: true
---

# Sparse retrieval

Sparse retrieval scores a document by the query terms it literally contains.
The representation is a vector over the vocabulary, almost all of whose entries
are zero — hence "sparse" — and matching is a lookup in an inverted index
rather than a distance computation in a learned space.

BM25 is the scoring function most systems mean when they say "keyword search".
It is forty years old, has no learned parameters beyond two constants, and
remains a serious baseline that dense retrievers are still measured against.

## What BM25 actually computes

For each query term, BM25 combines three quantities:

**Inverse document frequency.** A term appearing in few documents discriminates
better than one appearing everywhere. Terms that occur in most of the
collection contribute almost nothing.

**Term frequency, saturated.** A document containing a query term ten times is
more relevant than one containing it once, but not ten times more relevant.
BM25 passes term frequency through a saturating function controlled by `k1`, so
additional occurrences yield diminishing returns. This is the part naive tf-idf
gets wrong, and it matters: without saturation, a page that repeats a word two
hundred times outranks a page that discusses it properly.

**Document length normalisation.** A long document contains more terms by
accident. BM25 divides by a length ratio, damped by `b`, so a long document
must contain proportionally more query terms to score as highly as a short one.

The two constants have conventional defaults that work well enough across
collections that most systems never tune them.

## Why it survives

Dense retrieval learns a semantic space; BM25 does not. That sounds like a
disadvantage until the query contains a term the embedding model has never seen
in training — a product code, a version number, an API name, a person's
surname, a newly coined term of art. An embedding model maps unfamiliar tokens
to something vague. An inverted index either has the term or does not.

For a corpus like this project's, which is dense with terminology — `nDCG`,
`pgvector`, `AG-UI`, `Recall@K` — this is not a corner case. A question naming
a specific technique is precisely the question a lexical index answers best.

BM25 also needs no training, no embedding model, and no vector store. Its index
is cheap to build and cheap to update incrementally, which matters for corpus
freshness.

## Where it fails

It cannot match paraphrase. A note explaining "chunk boundaries should follow
document structure" will not be retrieved by a query asking "how should I split
my documents", because the two share almost no terms. Vocabulary mismatch
between what an author wrote and what a reader asks is the classic failure of
lexical retrieval, and it is exactly what dense retrieval was built to fix.

It also has no notion of a term's importance beyond corpus statistics. A term
that is rare in the collection is treated as discriminative even when it is
rare because it is incidental.

## What this means here

Sparse and dense retrieval fail in different directions, which is the whole
argument for running both and fusing the results rather than choosing one. The
fusion step has its own note.

For evaluation, BM25 is worth keeping as a reported arm even after hybrid
retrieval is in place. If the hybrid system cannot beat BM25 alone on this
corpus, that is a finding about the corpus or the embedding model, and it is
better to know it than to assume the more elaborate pipeline is earning its
cost.