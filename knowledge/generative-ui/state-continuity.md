---
title: State continuity and malleable interfaces
domain: generative-ui
tags:
  - state-continuity
summary: What happens to what the user did when the interface is regenerated, and why state has to outlive the rendering that produced it.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: Malleable Software
    url: https://www.inkandswitch.com/malleable-software/
    author: Ink & Switch
    retrieved: 2026-08-29
    license: Research programme page; no author or publication date stated. Short attributed quotations only.
    primary: true
  - sourceType: documentation
    title: AG-UI Overview
    url: https://docs.ag-ui.com/
    author: AG-UI Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
---

# State continuity and malleable interfaces

A generated interface is disposable. What the user did in it is not. Deciding
which is which is the central design problem of any interface that regenerates.

## The problem in its simplest form

A reader opens the sources under a claim, scrolls to the interesting excerpt,
then asks a follow-up. The system generates a new response. Where is the
reader?

If the answer is "back at the top with everything collapsed", the interface has
thrown away work the reader did. The follow-up is the reader saying *I am
engaged with this* — and the system responds by resetting their position.

Compounding matters: the cost is proportional to engagement. The reader who
explored most loses most, which teaches exactly the wrong lesson.

## The distinction to hold

The rendering is derived. The user's relationship to it is not.

Derived, safe to discard: which components were chosen, their arrangement,
their internal formatting.

Not derived, must survive: which sections the reader opened, which entities
they added to a comparison, what they typed and did not submit, where they had
scrolled to.

The second list is authored by the user. Nothing regenerates it, and no
subsequent model call can reconstruct it.

## Why it gets lost by default

The natural implementation regenerates a response object and re-renders from
it. Expansion state, selections, and drafts live in the components, so
replacing the components drops them.

Two related habits prevent it:

- **Keep interaction state outside the rendered tree**, keyed to something
  stable — a card identifier that survives regeneration, not a position in an
  array. Positional keys reattach the reader's state to the wrong card as soon
  as ordering changes.
- **Amend rather than replace.** A follow-up that adds cards should add them;
  regenerating the whole response to append one card discards everything by
  construction.

There is a third, less obvious rule: **every value that affected the first
render must be recoverable later.** A decision that lived only in a local
variable is a defect the moment a conversation is restored, and it is invisible
until then.

## State as a protocol concern, not an application one

The event-based agent-user protocol treats shared state as a first-class
building block alongside streaming and tool calls, carried as incremental
deltas rather than as whole snapshots.

That framing is worth borrowing even without the protocol. A delta says what
changed; a snapshot says what things are now. Regenerating from a snapshot
cannot preserve anything the snapshot does not contain, so the user's expansion
and selection are lost by construction — not by oversight, but because the
representation has no room for them. Amending from a delta leaves untouched
state untouched by default.

Where state continuity is hard, it is usually because the interface is being
rebuilt from snapshots and the durable part was never in the snapshot.

## Malleability is the same problem, further out

The research programme this note is drawn from argues for software users can
adapt to their own way of thinking, rather than workflows bent to fit rigid
prefabricated applications.

Generated UI is one route to that, and it inherits the hardest part. If a user
can shape their tool, their shaping is the valuable artefact — more valuable
than any particular tool version, because it is the part they authored. A
system that regenerates freely while treating user adaptation as ephemeral has
the value backwards: the durable thing is being discarded and the disposable
thing is being preserved.

## What this means here

The architecture keeps three states separate: the conversation, the knowledge
(corpus version, retrieved evidence, sources), and the UI (expansion,
selection, comparison membership). UI state is never to be the source of truth
for a citation, and M2 requires a test asserting that mutating it leaves
rendered citations unchanged. None of it is built.

Card-state preservation across follow-up turns is a named success metric rather
than a nicety. The design has "explain further" append cards and leave existing
ones where the reader left them — and if that turns out not to hold, it is a
measured failure rather than an unnoticed annoyance.