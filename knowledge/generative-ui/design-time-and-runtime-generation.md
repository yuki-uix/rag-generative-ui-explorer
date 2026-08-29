---
title: Design-time and runtime generation
domain: generative-ui
tags:
  - design-time-vs-runtime
summary: Generating an interface before anyone uses it versus generating one per request, and why the second inherits problems the first never had.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Automatically Generating Personalized User Interfaces with Supple
    url: https://www.eecs.harvard.edu/~kgajos/papers/2010/gajos10supple-aij.pdf
    author: Krzysztof Z. Gajos, Daniel S. Weld, and Jacob O. Wobbrock
    published: "2010"
    retrieved: 2026-08-29
    license: Artificial Intelligence journal. Author-hosted copy; short attributed quotations only.
    supports:
      - interface-generation-as-optimisation
      - what-is-genuinely-different-now
      - design-time-versus-runtime
      - what-partial-runtime-generation-buys
    primary: true
---

# Design-time and runtime generation

Automatic interface generation is older than language models. Reading the
earlier work is useful mainly for seeing which of today's problems are new and
which were solved, or at least characterised, twenty years ago.

## Interface generation as optimisation

The system this note is drawn from treated rendering an interface as a search
problem: given a functional specification of what the interface must expose, a
description of the device's constraints, and a model of the cost of the user's
expected actions, find the rendition that satisfies the constraints and
minimises that cost.

Three properties of that formulation are worth carrying forward.

**The output space was bounded by construction.** The system chose among
widgets it knew, arranged by rules it followed. It could produce an interface
nobody had drawn, but not an interface outside its vocabulary.

**The objective was explicit.** Expected user effort, estimated from a model of
interaction. When the result was bad, you could ask which term of the objective
was wrong.

**Personalisation came from traces, not from a prompt.** The system adapted to
an individual by observing how they actually used it, and the paper's strongest
results were for users whose motor abilities made standard layouts costly —
where a generated interface measurably outperformed the hand-designed one.

## What is genuinely different now

A language model generating UI has none of those three properties. There is no
functional specification, no stated objective, and no trace-derived model of
the user. It has, in exchange, something the earlier systems could not do at
all: it can generate an interface for a request nobody anticipated, expressed
in prose.

That is a real gain and it is worth being precise about what it costs. When the
output is wrong there is no objective term to inspect; the answer is that the
model produced this. Debugging shifts from analysis to sampling.

## Design-time versus runtime

The axis that matters operationally is *when* generation happens.

**Design time.** A model generates an interface once, a person reviews it, and
the result is committed as code. The model is a productivity tool for the
developer, and the user never meets it. Every downstream guarantee — testing,
accessibility, security review — applies exactly as it would to hand-written
code, because that is what the artefact is.

**Runtime.** A model generates an interface per request, and the user sees the
output directly. Nobody reviews any particular rendering, because there are as
many renderings as requests.

Almost every practical problem with generative UI belongs to the second case.
It is not the generation that is hard, it is the absence of a review step
between generation and a person.

## What partial runtime generation buys

Between the two sits generation constrained to a reviewed vocabulary: the model
decides at runtime, but only among things reviewed at design time.

This recovers most of what design-time review provided — components are tested,
accessible, and consistent — while keeping the ability to respond to an
unanticipated request. What it gives up is expressiveness: the interface can
only be composed of what someone thought to build.

## What this means here

This project generates at runtime within a design-time vocabulary. Five card
types are reviewed once; the model chooses among them per question and fills
their fields.

The evaluation is designed around exactly that seam. A fixed-card arm is to
render the same retrieval results in a predetermined layout, so a difference
between it and the dynamic arm isolates the value of the runtime decision —
separately from the value of having cards at all. The arms are M4.