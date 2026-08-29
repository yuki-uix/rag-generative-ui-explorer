---
sourceType: paper
title: Note title as it should appear in a citation
domain: rag
tags:
  - retrieval-strategies
  - ingestion-chunking
summary: One sentence on what this note establishes, shown in source listings.
url: https://example.invalid/papers/replace-me
author: Author or organization responsible for the source
published: 2026-01-15
retrieved: 2026-08-29
license: Replace with the licence or quotation constraint that applies
---

# Note title

Replace this body with original explanatory prose. The corpus stores your own
explanation of the source, not a copy of it.

## Using a section per idea

Chunking follows headings, and evidence IDs are built from the heading slug plus
the chunk's position within that section. One idea per section keeps citations
pointing at something a reader can actually locate.

## Quoting the source

Keep excerpts short and clearly marked:

> A short, attributed excerpt belongs in a blockquote.

Anything not in a blockquote is read as your own writing and may be summarised
or paraphrased by the system.

## Frontmatter reference

`sourceType` selects which metadata the note must carry.

- `paper`, `specification`, `documentation` require `url`, `author`,
  `published`, `retrieved`, and `license`.
- `original` — a note written for this repository with no upstream source —
  requires `author` and `revised` instead, and must not carry `url`,
  `published`, `retrieved`, or `license`.

Every note requires `title`, `domain` (`rag`, `generative-ui`, or
`intersection`), at least one entry in `tags`, and a `summary` of at most 300
characters. `domain` must match the directory the note lives in.

`tags` come from the controlled vocabulary in
`packages/corpus/src/topics.ts`, which mirrors the topic lists in
[knowledge scope](../docs/KNOWLEDGE_SCOPE.md). An invented tag fails validation:
coverage of the scope has to be computable without reading every note.

Files whose name starts with `_`, and every `README.md`, are validated but are
not part of the corpus and do not appear in the manifest.
