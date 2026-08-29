---
title: Note title, matching the heading below
domain: rag
tags:
  - retrieval-strategies
  - ingestion-chunking
summary: One sentence on what this note establishes, shown in source listings.
author: your-handle
revised: 2026-08-29
sources:
  - sourceType: paper
    title: The source's own title, as it should appear in a citation
    url: https://example.invalid/papers/replace-me
    author: Author or organization responsible for the source
    published: 2026-01-15
    retrieved: 2026-08-29
    license: Replace with the licence or quotation constraint that applies
    primary: true
---

# Note title, matching the heading below

Replace this body with original explanatory prose. The corpus stores your own
explanation of the sources, not a copy of them.

## The note and its sources are different things

`title` and `author` describe **the note** — your writing. `sources` describe
what it draws on.

Keeping them separate is not bookkeeping. Ingestion carries frontmatter onto
every chunk, so if `title` held a cited paper's name, every chunk of your own
analysis would be displayed under that paper's name and link, and a reader
following the citation would find nothing resembling what they clicked from.
`title` must match this note's top-level heading, and validation enforces it.

## Using a section per idea

Chunking follows headings, and evidence IDs are built from the heading slug plus
the chunk's position within that section. One idea per section keeps citations
pointing at something a reader can actually locate.

## Citing more than one source

List every source the note draws on, not only the main one. Exactly one carries
`primary: true` — the source the note is principally an explication of.

If a section discusses a technique from a different paper, that paper belongs in
`sources`. A note whose content outruns its citations is the failure this corpus
exists to avoid.

## Design intent, not implementation status

If the note ends with a section relating its subject to this project, that
section describes what the design calls for — not what is built. Use "the design
calls for", "is specified to", or "will", and name the milestone where it helps.

Present tense is for what exists today. Do not claim a given test exists unless
it does — validation rejects the indicative phrasing outright, so use the gerund
("a test asserting X") when describing a specification. See `README.md` in this
directory for the exact rule and why it matters more here than in ordinary
documentation.

## Quoting a source

Keep excerpts short and clearly marked:

> A short, attributed excerpt belongs in a blockquote, with the source named.

Anything not in a blockquote is read as your own writing and may be summarised
or paraphrased by the system.

## Frontmatter reference

Every note requires `title`, `domain` (`rag`, `generative-ui`, or
`intersection`), at least one entry in `tags`, a `summary` of at most 300
characters, an `author`, and a `revised` date. `domain` must match the directory
the note lives in.

`tags` come from the controlled vocabulary in
`packages/corpus/src/topics.ts`, which mirrors the topic lists in
[knowledge scope](../docs/KNOWLEDGE_SCOPE.md). An invented tag fails validation:
coverage of the scope has to be computable without reading every note.

Each entry in `sources` requires `sourceType` (`paper`, `specification`, or
`documentation`), `title`, `url`, `author`, `published`, `retrieved`, and
`license`. `published` may be `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` — state the
precision the source itself gives and no more. A note with no external sources
omits `sources` entirely.

Files whose name starts with `_`, and every `README.md`, are validated but are
not part of the corpus and do not appear in the manifest.
