---
title: "Failure modes"
domain: rag
tags:
  - rag-failure-modes
summary: "Four failures that look identical at the output - retrieval miss, lost context, conflicting sources, and unsupported synthesis - and how to tell them apart."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "Benchmarking Large Language Models in Retrieval-Augmented Generation"
    url: "https://arxiv.org/abs/2309.01431"
    author: "Jiawei Chen, Hongyu Lin, Xianpei Han et al."
    published: "2023-09-04"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2309.01431. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - retrieval-miss
      - conflicting-sources
      - unsupported-synthesis
    primary: true
  - sourceType: "paper"
    title: "Large Language Models Can Be Easily Distracted by Irrelevant Context"
    url: "https://arxiv.org/abs/2302.00093"
    author: "Freda Shi, Xinyun Chen, Kanishka Misra et al."
    published: "2023-01-31"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2302.00093. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - lost-context
  - sourceType: "paper"
    title: "Lost in the Middle: How Language Models Use Long Contexts"
    url: "https://arxiv.org/abs/2307.03172"
    author: "Nelson F. Liu, Kevin Lin, John Hewitt et al."
    published: "2023-07-06"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2307.03172. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - lost-context
---

# Failure modes

A wrong RAG answer looks the same regardless of which stage produced it. The
value of naming the modes is that each has a different fix, and a system that
cannot distinguish them will fix the wrong stage.

The work this note is drawn from separates the abilities a RAG system needs
into distinct testable capacities rather than a single accuracy figure — noise
robustness, rejecting the unanswerable, integrating multiple documents, and
handling counterfactual sources. The four modes below follow that split.

## Retrieval miss

The evidence was never retrieved. Nothing downstream can recover it.

Detected by comparing the retrieval set against golden evidence: Recall@K on
the evaluation questions. This is the only mode visible without looking at the
answer at all, and it is why retrieval is measured on its own.

Fixes belong to retrieval: hybrid rather than single-strategy, query rewriting,
a larger candidate set, better chunking.

## Lost context

The evidence was retrieved and the model did not use it. Recall is perfect and
the answer is still wrong.

Three common causes. The passage sat in the middle of a long context, where
models attend least. It was crowded out by topically related but unhelpful
passages. Or it was retrieved as a fragment that no longer made sense outside
its document.

Detected by the gap between retrieval metrics and answer metrics: high
Recall@10, low faithfulness. The oracle arm makes this sharp — feed
human-selected correct evidence and see whether the answer becomes right. If it
does, retrieval was the problem; if it does not, the problem is downstream.

## Conflicting sources

Two retrieved passages disagree, and the model silently picks one.

This is the most dangerous mode because the output is confident, well-cited,
and possibly wrong — the citation points at a real passage that really does say
that, while another retrieved passage says the opposite. Every mechanical check
passes.

The counterfactual case in the source benchmark is a sharper version: a
retrieved passage contradicts what the model knows, and the question is whether
the system notices at all.

Detection needs the system to look for it. Nothing about ordinary generation
surfaces disagreement; a pipeline that never checks will never report a
conflict.

## Unsupported synthesis

The model combines retrieved facts into a claim none of them supports. Each
component is grounded; the conclusion is not. Two passages say technique A
reduces latency and technique B reduces cost, and the answer says A and B
together give the best of both.

This is the mode that field-level citation exists to catch. At answer level,
the claim appears cited because its parts are. At claim level, the synthesised
sentence has no passage to point at, and the absence becomes visible.

## Distinguishing them

The modes are ordered by how early they occur, and diagnosis follows the same
order: check recall first, then whether the model used what it received, then
whether the sources agreed, then whether the conclusion exceeds them. Skipping
to the last is how a retrieval bug gets addressed with prompt changes.

## What this means here

The design assigns each mode its own detection route. Retrieval miss is to be
measured by Recall@10 against golden evidence; lost context isolated by the
oracle evaluation arm; unsupported synthesis caught by field-level evidence
references and the `inferred` label. Those routes are M1 and M4 and are not
built.

Conflicting sources is the one already settled in the contract: the response
schema requires an incomplete response to state whether the reason is `missing`
or `conflicting`, so a system that quietly picks a side fails validation rather
than merely being impolite.

Saying "the corpus does not answer this" is correct behaviour, not a failure. A
system that always produces an answer has no way to express the difference
between knowing and not knowing.