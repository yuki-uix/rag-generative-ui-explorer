---
title: "Ingestion, parsing, chunking, and metadata"
domain: rag
tags:
  - ingestion-chunking
summary: "Why chunk boundaries decide what can be retrieved, what a chunk loses when it is cut out of its document, and how stable chunk identity underpins citation."
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: "documentation"
    title: "Introducing Contextual Retrieval"
    url: "https://www.anthropic.com/news/contextual-retrieval"
    author: "Anthropic"
    published: "2024-09-19"
    retrieved: "2026-08-29"
    license: "Anthropic engineering post. Short attributed quotations only; text not reproduced."
    primary: true
---

# Ingestion, parsing, chunking, and metadata

Ingestion turns documents into the units retrieval actually operates on. Those
units are what gets scored, what gets cited, and what the reader eventually
sees, so the decisions made here constrain everything downstream in ways that
no later stage can undo.

## The chunk is the unit of retrieval and of citation

A chunk too large dilutes its own relevance: the query matches one paragraph
and the whole page is scored on it, then the model receives mostly irrelevant
text. A chunk too small loses the context that made it meaningful, and the
citation points at a fragment a reader cannot orient in.

Splitting on a fixed token count is the default and the worst option, because
it cuts wherever the count runs out — mid-sentence, mid-table, between a claim
and its qualifier. Splitting on document structure instead keeps a chunk
corresponding to something an author actually delimited: a section, a step, a
definition.

This is also what makes a citation locatable. A reader who follows a citation
to "section 3, second paragraph" can check it. A reader sent to "characters
4096–4608" cannot.

## What a chunk loses when it is extracted

A passage inside a document inherits meaning from its surroundings. Lifted into
an index, it loses that. A paragraph beginning "This approach fails when the
corpus is large" no longer says which approach; a table row reading "0.82" no
longer says what was measured.

The technique this note is drawn from addresses that by prepending a short
generated description of where the chunk sits in its document before the chunk
is embedded and indexed — so the retrievable representation carries the context
the raw text lost. The reported effect is a substantial reduction in retrieval
failures, and it applies to both the lexical and the dense index.

The cost is a generation pass over the entire corpus at ingest time, and a
representation that is no longer identical to the source text. That second
point matters for a system that quotes: what was indexed and what is displayed
have diverged, so the excerpt shown to a reader must come from the original
chunk, not from the augmented one.

## Metadata is part of ingestion

Chunks carry more than text. Title, section, source URL, publication date, and
licence all travel with the chunk because they are needed later — for display,
for filtering, for freshness, and for knowing what may be quoted.

Metadata absent at ingest is not recoverable at query time. This is the
practical argument for validating note metadata before ingestion rather than
after: a document missing its licence produces chunks missing their licence,
and the first place anyone notices is the interface that has to decide whether
it may show an excerpt.

## Identity has to be stable

Every chunk needs an identifier that survives re-ingestion. Citations resolve
through it, evaluation labels are stored against it, and generation logs record
it.

If identifiers are assigned by position in a global sequence, editing one
document renumbers everything after it, and every stored label silently points
somewhere else. Deriving the identifier from the document, the section, and the
chunk's content instead confines the damage: editing a paragraph changes that
chunk's identity and nothing else.

## What this means here

Evidence identifiers are derived from document, section, position, and a
content hash. That rule is implemented and its stability is tested: re-deriving
from an unchanged document reproduces the same identifiers, and editing one
paragraph moves only that chunk's.

The ingestion that will use it is M1 and not yet built. The design calls for
chunk boundaries to follow headings, so `section` is populated and citations
name something a reader can locate, and for re-ingesting an unchanged corpus to
produce a byte-identical index.

Contextual augmentation is deliberately not in the MVP. It adds a generation
pass over the corpus and separates indexed text from displayed text, and
neither cost is worth paying before the plain baseline has been measured.