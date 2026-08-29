---
sourceType: original
title: Production concerns for a grounded knowledge system
domain: rag
tags:
  - rag-production
summary: Freshness, versioning, access control, latency, cost, observability, and cache invalidation, and which of them a corpus-backed explorer can defer.
author: yuki-uix
revised: 2026-08-29
---

# Production concerns

Most RAG writing stops at retrieval quality. The concerns below are what decide
whether a system that retrieves well is operable, and several of them shape
design choices that are expensive to revisit later.

## Versioning is the one that cannot be retrofitted

An answer is a function of three things: the model, the prompt, and the corpus.
Recording only the first two makes results unreproducible, because the corpus
changes more often than either.

A corpus version has to be derived from content, not assigned by hand. A hand-set
version is a claim someone has to remember to update; a content-derived hash
changes because the content changed. The derivation must cover metadata as well
as body text — retagging a note or correcting its licence changes what retrieval
and display do, so a version computed from prose alone would report two
materially different corpora as the same one.

This is retrofittable in principle and painful in practice: every evaluation
result stored before the change is keyed on a version that meant something else.

## Freshness and staleness

External sources move. A URL that resolved when a note was written may 404 a
year later; a specification may be superseded; a figure quoted from a paper may
be revised in a later version.

Two distinct checks fall out. **Reachability** is mechanical and can be
automated. **Currency** — whether the source still says what the note claims —
cannot be, and needs a retrieval date recorded per note so that a human reviewing
the corpus knows how old each claim's verification is.

Reachability checking is worth keeping out of the merge gate. A check that
depends on a third party's uptime blocks unrelated work and trains people to
re-run it until it goes green, which is worse than not having it. On a schedule,
reporting rot, it does its job.

## Latency, and where it is spent

The stages have very different profiles. Retrieval over a small corpus is
milliseconds. Reranking with a cross-encoder is linear in candidates and can
dominate. Generation dominates everything else and scales with what was sent.

Two consequences worth stating in advance:

**Reducing model calls does not reliably reduce cost.** Merging two calls into
one larger call can raise total tokens, and a cached prefix costs a fraction of
an uncached one. Token counts that do not distinguish cached from uncached input
can overstate spend severalfold, and the same number then gets used as a proxy
for cost, for context pressure, and for work done — three things it measures
differently.

**Extrapolation from small runs has a poor record.** Cost and latency should be
measured at the size that matters rather than projected linearly from a smaller
one.

## Observability

The minimum that makes a failure diagnosable after the fact: the query, the
corpus version, the model and sampling parameters, the prompt version, the
retrieval candidates with scores, the reranked set, the raw model output *before
any repair*, the validation result per stage, and the final response.

The pre-repair capture matters more than it looks. A metric like "valid output
without a second call" cannot be computed from logs that only record the final
state, and a pipeline that repairs quietly will look healthier than it is.

Process exit status is not a health signal. A run can exit zero having made no
useful call at all, so success has to be read from the recorded payload rather
than from the return code.

## Cache invalidation

Caches key on something. Embedding caches key on chunk text; answer caches key
on the query; prompt caches key on a prefix. Each becomes wrong when the thing
it keys on changes, and the failure is silent — a stale hit looks exactly like a
fresh one.

Including the corpus version in every cache key makes invalidation a consequence
of the version changing rather than a step someone must remember.

## Access control

Not applicable here, and worth saying why explicitly: the corpus is a single
public body of notes with no per-user visibility. That is a scope decision, not
an oversight.

It is also the concern that most resists being added later. Retrieval that
assumes every chunk is visible to every reader has no place to put a filter, and
the filter has to apply before ranking rather than after — filtering a ranked
list changes what "top ten" means, and truncating after the fact leaks the
existence of documents the reader cannot see.

## What this project defers

Access control, multi-tenancy, and cross-device persistence are out of scope.
Contextual augmentation at ingest is deferred until the plain baseline is
measured. A database-backed vector store is deferred while the corpus is small
enough that an in-process index gives the same answers for less operational
weight, with retrieval kept behind an interface so the substitution stays cheap.

Versioning, observability, and reachability checking are not deferred, because
each of them is far more expensive to add after there are results that depend on
them.
