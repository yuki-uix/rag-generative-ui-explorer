---
title: Evaluating generated interfaces
domain: generative-ui
tags:
  - genui-evaluation
summary: Task completion, correction rate, comprehension, consistency, and preference — which are mechanical, which need people, and which a model can grade.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: "UIClip: A Data-driven Model for Assessing User Interface Design"
    url: https://arxiv.org/abs/2404.12500
    author: Jason Wu, Yi-Hao Peng, Amanda Li et al.
    published: 2024-04-18
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2404.12500. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    primary: true
  - sourceType: paper
    title: Automatically Generating Personalized User Interfaces with Supple
    url: https://www.eecs.harvard.edu/~kgajos/papers/2010/gajos10supple-aij.pdf
    author: Krzysztof Z. Gajos, Daniel S. Weld, and Jacob O. Wobbrock
    published: "2010"
    retrieved: 2026-08-29
    license: Artificial Intelligence journal. Author-hosted copy; short attributed quotations only.
---

# Evaluating generated interfaces

An interface that varies per response cannot be evaluated the way a fixed one
is. There is no single artefact to test — there is a distribution of artefacts,
and what can be measured is a property of that distribution.

## Three kinds of measurement

Separating them matters because they carry very different confidence.

**Mechanical.** Determinate properties of the output: does the specification
validate, do all evidence references resolve, is any executable code present,
does every field carry a citation. These are yes/no per response, cheap, and
trustworthy from a single run. They should be exhausted before anything else is
attempted.

**Model-graded.** A model scores the output. Work on learned assessment of
interface design shows this can be trained to agree with human judgement of
design quality, which makes it useful for scanning many outputs cheaply. It also
inherits the usual caveats: scores vary between runs, vary with the grading
model and prompt, and can be wrong in ways correlated with the generator's own
blind spots. A number without the grader pinned and the dispersion reported is
not a measurement.

**Human.** Task completion, time to find a fact, correction rate, comprehension,
preference. Expensive, small-n, and the only source of truth for whether the
interface helped.

## The metrics that matter, and what each is for

**Task completion and time to locate a fact.** The load-bearing ones. If a
reader can find what they came for faster, structure earned its cost; if not,
nothing else redeems it.

**Correction rate.** How often the reader has to redirect the system — rephrase,
ask again, switch presentation. A high rate with high eventual completion means
the system gets there by making the user work.

**Comprehension.** Whether the reader can answer questions about what they read
afterwards. Distinct from completion: a reader can extract a fact from a table
without understanding the relationship the table encodes.

**Consistency.** Whether similar questions produce similar presentations. Only
measurable across a set, and directly connected to learnability.

**Preference.** Cheapest to collect and the weakest evidence. Readers reliably
prefer interfaces that look considered, including when those interfaces make
them slower. Preference should be reported and never used to settle a
disagreement with a completion-time result.

## The comparison has to be designed, not assembled

The earlier work on generated interfaces is a useful model here, not for its
techniques but for its method: it compared generated renditions against
hand-designed baselines on measured user effort, and reported where the
generated interface won and where it did not.

Three things that make such a comparison worth running.

**Pin every variable.** Same questions, same corpus version, same model, same
sampling parameters. Two runs that differ in an unrecorded way are not
comparable, and the data has to be discarded.

**Include an arm that isolates each claim.** Markdown versus fixed cards tests
whether structure helps. Fixed versus dynamic tests whether the model's choice
helps. Without both, a win cannot be attributed.

**Report dispersion, and report n.** Anything involving model choice varies
between runs. A per-cell result across domain and card type is a dozen samples,
and a dozen samples supports a direction at best.

## What this means here

Card-type selection accuracy is scored against expected card types labelled per
question in advance — the label has to exist before the system does, or the
metric is uncomputable and the discovery comes too late to act on.

The evaluation runs four arms: Markdown, fixed cards, dynamic cards, and an
oracle arm where human-selected evidence is fed to the planner. The oracle arm
exists to separate a bad card choice from a bad retrieval, which look identical
at the output and call for entirely different fixes.

The findings are required to document where dynamic cards perform *worse*. A
comparison that only reports where the new thing won is not a comparison.
