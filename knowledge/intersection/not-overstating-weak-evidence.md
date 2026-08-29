---
title: Not overstating weak evidence
domain: intersection
tags:
  - evidence-strength-honesty
summary: Structured presentation renders strong and weak support identically, so uncertainty has to be carried in the data rather than left to the reader to infer.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Teaching Models to Express Their Uncertainty in Words
    url: https://arxiv.org/abs/2205.14334
    author: Stephanie Lin, Jacob Hilton, Owain Evans
    published: 2022-05-28
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2205.14334. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    supports:
      - calibrated-words-not-calibrated-numbers
    primary: true
  - sourceType: paper
    title: Evaluating Verifiability in Generative Search Engines
    url: https://arxiv.org/abs/2304.09848
    author: Nelson F. Liu, Tianyi Zhang, Percy Liang
    published: 2023-04-19
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2304.09848. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    supports:
      - the-failure-the-verifiability-work-predicts
---

# Not overstating weak evidence

This is the failure most specific to the combination this project is testing.
Retrieval can be honest and generation can be faithful, and the *presentation*
can still assert more than the evidence supports — because structure carries a
claim of its own.

## Structure removes the hedge

Prose can hedge inside a sentence. "Reranking generally improves ordering,
though the corpus here says little about latency" tells a reader precisely how
much is known.

A table cell cannot say that. It either has content or it does not, and content
in a cell reads as fact. Populate a four-row comparison from two solid passages
and two guesses, and all four rows arrive with identical visual authority. The
guesses have been laundered by the layout.

This is a genuine regression against the Markdown baseline, and it has to be
counted honestly. The structured presentation is *less* able to express partial
knowledge than the prose it replaces, unless the structure is given somewhere
to put uncertainty.

## Calibrated words, not calibrated numbers

The work on verbalised uncertainty is relevant in a narrow way: a model can be
trained to express confidence in words, and those expressions can be calibrated
against actual correctness rather than being decorative.

The narrowness matters. That result is about a model expressing its own
uncertainty. What matters here is a different quantity — how well the retrieved
corpus supports a claim — and the model is not a reliable estimator of that. It
sees the passages it was given and has no view of what retrieval missed.

So the useful mechanism is not a confidence score. A card asserting "0.87
relevant" implies a calibration that does not exist, and a number is the most
authoritative-looking way to be wrong.

What can be stated honestly is **provenance**: this field is quoted, this field
is summarised across passages, this field is inferred and the sources do not
say it outright. That is a property of the relationship between the field and
the evidence, not an estimate of anything.

## Where the interface has to be willing to look worse

Three behaviours cost visual polish and are the point.

**Render nothing where nothing is supported.** An empty cell is honest. A cell
filled by inference to complete the table is a fabrication in a small box.

**Refuse to build the structure.** If the evidence will not support a
comparison, the answer is not a thin comparison — it is a different card, or an
evidence list, or a statement that the corpus does not answer this.

**Mark the response incomplete, with a reason.** Missing evidence and
conflicting evidence are different situations and a reader needs to know which.
Conflicting is the more dangerous one to smooth over: the system silently picks
a side, cites a real passage that really does say that, and every mechanical
check passes.

## The failure the verifiability work predicts

An interface that shows citations looks verifiable whether or not it is. Add
structure and the effect strengthens — a cited table reads as a considered
synthesis of a well-understood area.

If the underlying evidence is two thin passages, the interface has manufactured
authority. Nothing in the rendering is false, and the impression is.

That is the risk this project takes on by rendering evidence as cards, and it
is the reason the evaluation has to measure unsupported-claim rate and
insufficient-evidence detection rather than only whether readers liked the
result. Readers reliably prefer interfaces that look considered, including when
those interfaces are misleading them.

## What this means here

Two of these are already in the contract. Every factual field carries a
grounding mode — extracted, summarised, or inferred — and a response can mark
itself incomplete with a reason distinguishing missing from conflicting. Both
are schema requirements today, so an output that omits them does not validate.

The rest is design intent awaiting implementation: rendering inferred content
visibly differently is M2, and using similarity scores for ordering while never
displaying them as confidence is M1.

Unnecessary-card rate and unsupported-claim rate are named metrics, and the
findings are required to document cases where dynamic cards perform worse — a
comparison that only reports wins is not a comparison.