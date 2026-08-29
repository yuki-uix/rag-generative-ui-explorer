---
title: Streaming and incremental rendering
domain: generative-ui
tags:
  - streaming-rendering
summary: Why streaming text is easy and streaming a validated structure is not, and the trade between showing partial output early and never showing an invalid one.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: Generative User Interfaces
    url: https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces
    author: Vercel
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - text-streams-structure-does-not
    primary: true
  - sourceType: documentation
    title: Server Components
    url: https://react.dev/reference/rsc/server-components
    author: React team, Meta
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - text-streams-structure-does-not
  - sourceType: documentation
    title: AG-UI Overview
    url: https://docs.ag-ui.com/
    author: AG-UI Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - text-streams-structure-does-not
---

# Streaming and incremental rendering

Streaming is why chat interfaces feel fast. The first token arrives in a few
hundred milliseconds and the reader starts reading while the rest is still
being produced. Applying the same idea to structured output is harder than it
looks, and the difficulty is not technical.

## Text streams; structure does not

Text has the convenient property that a prefix is meaningful. Half a sentence
is half a sentence.

Half a JSON object is not half an object. It is a syntax error, and more
importantly it is *not yet checkable*: whether a card's evidence references
resolve, whether its rows align with its entities, whether the response marks
itself incomplete — none of it can be evaluated until the structure is
complete.

So the choice is real:

**Render as it arrives.** Fast to first pixel. But partial structure has to be
rendered before validation, which means displaying content that may fail a
check a moment later, and possibly retracting it in front of the reader.

**Render after validation.** Nothing invalid is ever shown. But the reader
watches a spinner for the whole generation, and time to first content is the
full round trip.

The web platform has spent years making the first option easy. Server
Components render on the server and stream their output as it becomes ready, so
a page can display a finished region while another is still resolving —
component-level rather than token-level streaming. The SDKs for model-driven
interfaces build directly on that, streaming a component as its tool result
arrives, and the event-based agent protocols carry the same granularity as
incremental deltas for text and for state.

All of that machinery assumes the streamed unit is independently meaningful. A
region that resolves is a region you can show. A partially-parsed card whose
citations have not been checked is not, and no amount of streaming
infrastructure changes that — ease of implementation is not the deciding factor
here.

## Streaming status is not streaming content

There is a third position that is often conflated with the first: stream the
*process* rather than the output.

"Searching the corpus", "found nine passages", "building comparison" — each
arrives as it happens, the reader learns something real about progress, and no
unvalidated content is displayed. It does not reduce time to first *content*;
it reduces the interval in which the reader has no idea whether anything is
happening, which is the thing that actually feels slow.

This is honest only when the messages describe real stages. Invented progress
narration is worse than a spinner, because it teaches the reader to distrust
what the interface says about itself.

## Retraction is the cost people underestimate

If partial output is rendered and then fails validation, something has to
happen on screen. Every option is bad: content vanishes, content changes under
the reader's eye, or an error replaces what they were mid-sentence through.

A reader who watches a claim appear and then disappear has learned something
about the system's reliability that no amount of later correctness undoes. For
an interface whose entire proposition is that its claims are traceable, that is
an expensive impression to create for a latency win.

## What this means here

The MVP is specified to stream status and render cards atomically after
validation, so that nothing unvalidated reaches the screen and nothing is
retracted. The rendering is M2 and the validation M3; neither is built.

**This is expected to lose on time to first content**, and the comparison is
against a Markdown baseline that streams token by token. Stating the prediction
in advance matters: if dynamic cards come out slower on that metric, it is a
consequence of the design and not a discovery, and the argument has to be won
on time to *locate a fact* instead. If it is not won there, the trade was
wrong.