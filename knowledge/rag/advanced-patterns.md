---
title: "Advanced RAG patterns"
domain: rag
tags:
  - advanced-rag-patterns
summary: "Multi-hop, corrective, agentic, and graph-based RAG - what question each pattern answers that plain retrieval cannot, and what each costs."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "paper"
    title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization"
    url: "https://arxiv.org/abs/2404.16130"
    author: "Darren Edge, Ha Trinh, Newman Cheng et al."
    published: "2024-04-24"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2404.16130. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - graph-rag
    primary: true
  - sourceType: "paper"
    title: "Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions"
    url: "https://arxiv.org/abs/2212.10509"
    author: "Harsh Trivedi, Niranjan Balasubramanian, Tushar Khot et al."
    published: "2022-12-20"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2212.10509. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - multi-hop
  - sourceType: "paper"
    title: "Corrective Retrieval Augmented Generation"
    url: "https://arxiv.org/abs/2401.15884"
    author: "Shi-Qi Yan, Jia-Chen Gu, Yun Zhu et al."
    published: "2024-01-29"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2401.15884. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - corrective-retrieval
  - sourceType: "paper"
    title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection"
    url: "https://arxiv.org/abs/2310.11511"
    author: "Akari Asai, Zeqiu Wu, Yizhong Wang et al."
    published: "2023-10-17"
    retrieved: "2026-08-29"
    license: "arXiv preprint, arXiv:2310.11511. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date; the link serves the latest version."
    supports:
      - agentic-rag
---

# Advanced RAG patterns

Plain retrieve-then-generate assumes one retrieval round returns everything the
answer needs. The patterns below each relax a different part of that
assumption, and each costs something specific.

## Multi-hop

Some questions cannot be answered by any single passage, because answering the
first part is what tells you what to retrieve next. "Which retrieval strategy
does the note on fusion recommend running first?" requires finding the fusion
note before you know what to look for.

Multi-hop interleaves retrieval with reasoning: retrieve, reason about what is
still missing, retrieve again. The cost is one or more extra round trips on the
critical path, and a new failure mode — a wrong first hop sends the second hop
somewhere unrecoverable, and the final answer is confidently grounded in
evidence that answers a question nobody asked.

## Corrective retrieval

Plain RAG uses whatever retrieval returned. Corrective approaches add an
assessment step: judge the retrieved set, and if it is inadequate, do something
about it — re-query, decompose, widen the search, or decline.

The useful part is the explicit judgement. A pipeline that never evaluates its
own retrieval cannot distinguish "retrieval succeeded and the answer is thin"
from "retrieval failed and the model improvised", which is the same distinction
the failure-modes note turns on.

The cost is an extra model call per query, and a threshold that decides when
retrieval was good enough — a threshold that has to be calibrated, and that
drifts when the corpus or the embedding model changes.

## Agentic RAG

The model decides *whether* to retrieve, *what* to retrieve, and *when it has
enough*, rather than following a fixed pipeline.

This is the most flexible and the least predictable. Latency becomes variable
rather than bounded, cost varies per query, and reproducing a result requires
replaying a sequence of decisions rather than a single call. For a system being
evaluated on comparable runs, that variance is a direct cost: two runs of the
same question are no longer the same experiment.

## Graph RAG

The pattern this note is anchored to addresses a question chunk retrieval
cannot answer at all: queries about the corpus as a whole. "What are the main
themes across these documents?" has no answer in any individual chunk, so no
top-K retrieval over chunks can find one.

The approach builds a graph of entities and relationships from the corpus,
clusters it into communities, and summarises each community in advance. A
global question is then answered from those summaries rather than from
retrieved passages.

The costs are substantial and worth stating plainly: a graph extraction pass
over the whole corpus, summary generation per community, and a re-run of both
whenever the corpus changes. It buys a class of question that is otherwise
unanswerable — which is either exactly what you need or entirely irrelevant,
with little middle ground.

## Choosing

The patterns are not a maturity ladder. Each answers a specific question that
plain retrieval cannot, and adopting one whose question you do not have buys
latency and unpredictability for nothing.

The order worth trying: make plain retrieval work and measure it; add multi-hop
if the evaluation set contains questions needing evidence that only a second
retrieval could locate; add corrective assessment if the failure analysis shows
the system answering confidently from inadequate retrieval; consider graph
approaches only if global questions are actually being asked.

## What this means here

None of these are in the MVP. Of the three actions the design specifies, one
re-retrieves: explaining further is to run a narrower retrieval scoped to a
card, a constrained user-initiated hop rather than an autonomous one — the user
decides there should be another round, and what it is about. The actions are M4
and are not built.

That constraint is deliberate. The MVP's question is whether dynamic card
selection helps comprehension, and answering it requires holding retrieval
fixed. An agentic retrieval loop would make two runs of the same question
incomparable, which would cost the experiment more than the pattern could
return.