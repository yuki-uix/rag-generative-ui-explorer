---
title: Comparing Markdown, fixed cards, and dynamic cards
domain: intersection
tags:
  - presentation-comparison
summary: Four arms, what each one isolates, and the results this project should expect to lose on if the experiment is honest.
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
      - four-arms-three-claims
    primary: true
  - sourceType: paper
    title: Evaluating Verifiability in Generative Search Engines
    url: https://arxiv.org/abs/2304.09848
    author: Nelson F. Liu, Tianyi Zhang, Percy Liang
    published: 2023-04-19
    retrieved: 2026-08-29
    license: arXiv preprint, arXiv:2304.09848. Non-exclusive licence to distribute; short attributed quotations only. published is the v1 submission date.
    supports:
      - results-this-project-should-expect-to-lose
---

# Comparing Markdown, fixed cards, and dynamic cards

The MVP exists to answer one question: does dynamic card selection help people
understand and explore a technical topic better than a conventional Markdown
answer. Answering it requires a comparison designed to be losable.

## Four arms, three claims

Each adjacent pair isolates exactly one thing.

**Markdown.** Prose with citations, streamed. The baseline.

**Fixed cards.** The same retrieval results rendered as a predetermined card
sequence. Markdown versus this tests whether *structure* helps, independent of
any model deciding anything.

**Dynamic cards.** The model selects and populates card types. Fixed versus
this tests whether the *model's choice* helps, independent of whether cards
help.

**Oracle.** Human-selected correct evidence fed to the same planner. Dynamic
versus this separates a bad card choice from a bad retrieval — two failures
that are indistinguishable at the output and call for entirely different fixes.

Without the middle two, a win for dynamic cards over Markdown is
unattributable. It could be structure, it could be selection, and the fix for a
disappointing result differs completely depending on which.

The earlier work on generated interfaces is the methodological model here, not
for its techniques but for its shape: generated renditions measured against
hand-designed baselines on user effort, reporting where the generated interface
won and where it did not.

## Results this project should expect to lose

Stating these in advance is what stops a predictable consequence being reported
as a surprising discovery.

**Time to first content.** Markdown streams token by token; cards render
atomically after validation. Dynamic cards should lose, and the loss is a
design consequence rather than a finding. The argument has to be won on time to
*locate a fact* instead — and if it is not won there, the trade was wrong.

**Accessibility.** Well-formed prose is strongly accessible by default. A card
interface has to work to match it, and matching is the target rather than
beating it.

**Consistency.** A Markdown answer looks the same every time. Dynamic cards
vary by construction, and variation without meaning is a cost.

If dynamic cards win on nothing but preference, that is a negative result. The
verifiability work is the caution here: readers find fluent, citation-bearing
output convincing largely independently of whether it is correct, and structure
strengthens that effect. Preference should be reported and should never settle
a disagreement with a completion-time result.

## Pinning the experiment

Non-negotiable, because unpinned runs produce data that has to be discarded:
same question set, same corpus version, same model and sampling parameters,
same prompt version, recorded per run. The harness should refuse to compare
arms that disagree on any pinned variable rather than comparing them silently.

Sample size deserves the same honesty. Sixty questions across three groups and
five card types leaves roughly a dozen per cell. Mechanical results — schema
validity, evidence-identifier validity, zero executable code — are determinate
from a single run. Anything involving model choice needs repetitions and
reported dispersion, and a per-cell result supports a direction at best.

## What this means here

The four arms are specified to run from one command on identical inputs, with
latency and cost measured on real runs rather than extrapolated and cached
input tokens distinguished from uncached. The harness is M4 and is not built —
so every prediction in this note is a prediction, including the ones about
losing.

The findings are required to document where dynamic cards perform worse. That
is an exit criterion, not a caveat — a comparison that only reports where the
new thing won has not tested anything.