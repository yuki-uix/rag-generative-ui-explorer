---
sourceType: paper
title: "Lost in the Middle: How Language Models Use Long Contexts"
domain: rag
tags:
  - context-assembly
summary: Position within the context window changes how well a model uses retrieved evidence, which makes assembly order a design decision rather than an implementation detail.
url: https://arxiv.org/abs/2307.03172
author: Nelson F. Liu et al. (Stanford University, UC Berkeley, Samaya AI)
published: 2023-07-06
retrieved: 2026-08-29
license: "arXiv preprint, arXiv:2307.03172. Non-exclusive licence to distribute; short attributed quotations only."
---

# Context assembly

Retrieval produces a ranked list. The prompt needs a linear block of text.
Turning one into the other involves choices — how many chunks, in what order,
with what surrounding structure — and those choices measurably change the
answer.

## Position is not neutral

The finding this note is drawn from is that a model's ability to use a piece of
evidence depends on where that evidence sits in the context. Accuracy is highest
when the relevant passage is at the beginning or the end, and drops when it sits
in the middle — a U-shaped curve rather than a flat one.

The practical consequence is uncomfortable for a naive pipeline. Concatenating
the top ten chunks in rank order puts ranks four through seven exactly where the
model attends least. Retrieval did its job, the evidence is present, and the
model still misses it.

Two mitigations follow directly:

**Send fewer chunks.** A smaller, better-selected set has no middle to get lost
in. This is what a reranker buys beyond ordering: it makes a short list
defensible.

**Order deliberately.** If the ranking is trustworthy, placing the strongest
evidence at the edges rather than in rank order uses the curve instead of
fighting it.

## More context is not more information

A long context window makes it possible to send fifty chunks. It does not make
that a good idea. Beyond the position effect, additional chunks bring:

- **Distraction.** Passages that are topically related but do not answer the
  question compete with the ones that do.
- **Conflict.** Two chunks that disagree force the model to choose, usually
  silently.
- **Cost and latency**, which scale with what is sent regardless of whether the
  model uses it.

The instinct that a larger budget should be spent is worth resisting. The
question is how much evidence the answer needs, not how much fits.

## What assembly has to preserve

For a system that cites, assembly is not just concatenation. The prompt has to
carry, for each chunk, an identifier the model can reference — otherwise the
model has no way to say which passage supports which claim, and citations become
something bolted on afterwards by guesswork.

The identifier also has to survive into validation. If the model cites a chunk,
the server needs to resolve that reference back to the retrieval set for the
current generation and reject anything that does not resolve.

## What this means here

Chunk count is a parameter worth measuring rather than defaulting. The
evaluation harness varies it and reports the effect, because the right value
depends on the corpus and the model, and both change.

Assembly is also where corpus text enters the prompt, which makes it a trust
boundary: retrieved text is data, never instruction. It has to be delimited so
that a passage containing something that reads like a directive is treated as
content — the corpus is authored for this repository today, but the boundary is
a property of the design, not of who happens to be writing the notes.
