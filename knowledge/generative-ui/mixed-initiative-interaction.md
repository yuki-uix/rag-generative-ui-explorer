---
title: Mixed-initiative interaction
domain: generative-ui
tags:
  - mixed-initiative
summary: Principles for coupling automated action with direct manipulation, and why the twenty-five-year-old formulation still describes today's failures.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: paper
    title: Principles of Mixed-Initiative User Interfaces
    url: https://erichorvitz.com/chi99horvitz.pdf
    author: Eric Horvitz
    published: 1999-05
    retrieved: 2026-08-29
    license: CHI 1999, pages 159-166, DOI 10.1145/302979.303030. Author-hosted copy; short attributed quotations only.
    primary: true
---

# Mixed-initiative interaction

The argument this note is drawn from was a response to a debate that has
returned almost unchanged: whether interface research should improve direct
manipulation or build agents that act on the user's behalf. Its answer was that
the framing is false, and that the interesting work is in coupling the two
well.

## The debate that came back

In 1999 the two camps were direct-manipulation metaphors versus interface
agents. In 2026 they are conventional UI versus conversational agents. The
positions are the same and so are the failure modes: automation that acts when
it should have asked, and manipulation that leaves the user doing work a system
could have done.

The paper's move is to treat this as a coupling problem — how automated service
and direct manipulation combine — rather than a contest one side wins.

## The principles that transfer

Several of the principles hold up unchanged, and each corresponds to a
recognisable present-day failure.

**Consider uncertainty about the user's goal.** A system that infers an
intention should represent that inference as uncertain rather than acting as if
it knows. Systems that skip this produce confidently wrong behaviour, which is
worse than hesitant correct behaviour because it gives the user nothing to push
against.

**Weigh the cost of being wrong against the benefit of being right.**
Automation is worth it when the expected value is positive, and that
calculation depends on how expensive a mistake is and how hard it is to undo.
Cheap, reversible actions should be taken; expensive or irreversible ones
should be proposed.

**Provide efficient ways to invoke and terminate.** The user must be able to
ask for the automated service directly, and to stop it, without hunting. A
system that decides on the user's behalf and offers no handle is not
mixed-initiative, it is just automated.

**Minimise the cost of poor guesses.** Design so that a wrong inference is
cheap to recover from. This is a design property, not a model property: the
same error rate is tolerable or intolerable depending on what a wrong guess
costs.

**Maintain working memory of recent interactions.** The system should remember
what just happened rather than treating each turn as fresh. This maps directly
onto state continuity — an interface that forgets what the user just did is
paying the cost of a poor guess on every turn, whether or not it guessed wrong.

## Applied to generated interfaces

A model choosing how to present an answer is making exactly the kind of
inference the paper describes: a guess at what the user is trying to do, acted
on without confirmation.

Two consequences follow.

The guess should be **cheap to override**. If the reader wanted prose and got a
comparison table, the path back should be one obvious action, not a rephrased
question and a full regeneration.

The system should **not present a guess as a certainty**. An interface that
renders a confident comparison from thin evidence has made an uncertain
inference and displayed it with the visual authority of a fact. The
presentation overstates what is known, which is a failure of calibration rather
than of retrieval.

## What this means here

The design has the reader initiate every retrieval, with nothing fetched
speculatively. All three specified actions are reader-initiated, and one of
them — showing sources — is deliberately local, so the cheapest way to check
the system's work never requires asking it again. The actions are M4.

Presentation is a guess, and it is a guess made once per question. The
evaluation is to measure how often it is the guess a person would have made,
and to treat a plausible-but-wrong choice as a failure rather than a near miss
— because to the reader, a definition rendered as a comparison is not nearly
right.