---
title: "Grounded generation and citation design"
domain: rag
tags:
  - grounded-generation
summary: "Making retrieval and grounding decisions explicit outputs of the model, and why the check on those outputs still has to live outside it."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection"
    url: "https://arxiv.org/abs/2310.11511"
    author: "Akari Asai, Zeqiu Wu, Yizhong Wang et al."
    published: "2023-10-17"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2310.11511. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    primary: true
---

# Grounded generation and citation design

Grounding is the claim that a generated statement is supported by a specific
retrieved passage. Making that claim checkable, rather than merely asserted, is
most of the engineering.

## Retrieval as a decision, not a fixed step

A standard pipeline retrieves on every query. Some questions do not need it —
they are conversational, or the answer is a restatement of something already in
the exchange — and retrieving anyway injects passages that can only distract.

The approach this note is drawn from makes retrieval a decision the model
emits, along with judgements about whether a generated segment is supported by
the passages it received. Grounding becomes an explicit output rather than a
property someone hopes holds.

The interesting move is not the specific training recipe. It is treating "is
this supported?" as something the system states rather than something a reader
infers from the presence of a citation.

## Where the claim gets checked

A self-assessment is still an assessment by the thing being assessed. A model
that emits a support judgement can emit a wrong one, and a model that emits a
citation can cite a passage that does not exist.

So the useful pattern is a division:

- **The model proposes.** Which passages support which claim, at what strength.
- **The server disposes.** Every cited identifier is resolved against the
  retrieval set for *this* generation. Unresolvable references are rejected
  outright — never repaired by substituting a plausible one, which would convert
  a detectable error into an undetectable one.

A prompt can ask for grounded output. It cannot guarantee it. The property has
to be re-established at the output boundary, because that is the only place it
can be checked rather than requested.

## Citation granularity

Where a citation attaches determines what it can be checked against.

**Document-level** citations are nearly free and nearly useless: a reader
cannot tell which sentence the source supports, and a validator can only
confirm the document was retrieved.

**Claim-level** or **field-level** citations attach to the individual
assertion. They cost more to produce and are strictly more checkable — the
validator can require that every factual field carries at least one reference,
and the absence of one becomes a structural failure rather than a stylistic
lapse.

The finer granularity also makes partial grounding visible. An answer with four
supported claims and one unsupported one is not "mostly cited"; it contains one
claim nobody can check, and field-level citation is what surfaces that.

## Labelling what kind of statement it is

Not every sentence in a good answer is an extract. Some are summaries across
passages; some are inferences the sources support but do not state.

Collapsing those into one undifferentiated "cited" category overstates the
extracted material and understates the inferred. Labelling each statement —
extracted, summarised, inferred — lets the interface show the difference, and
lets an inferred claim still carry the evidence it was drawn from without
pretending the source said it outright.

## What this means here

The response schema already requires every factual field to carry at least one
evidence identifier and to be labelled with how it relates to its sources; both
are enforced today by the contracts package.

Resolving those identifiers against the current generation's retrieval set is
the other half, and it is M3 and not built. The design is that the validator
rejects rather than repairs an unresolvable reference. Repairing one by picking
a nearby identifier would produce a response that passes every check and cites
the wrong passage — the worst possible outcome for a system whose entire
proposition is that its claims can be traced.