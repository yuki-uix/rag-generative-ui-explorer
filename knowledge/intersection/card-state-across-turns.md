---
title: Preserving card state across retrieval turns
domain: intersection
tags:
  - card-state-continuity
summary: A follow-up regenerates knowledge, not the reader's place in it, and keeping those apart requires identity that survives a new retrieval.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: Malleable Software
    url: https://www.inkandswitch.com/malleable-software/
    author: Ink & Switch
    retrieved: 2026-08-29
    license: Research programme page; no author or publication date stated. Short attributed quotations only.
    supports:
      - the-reader-who-explores-most-loses-most
    primary: true
  - sourceType: documentation
    title: AG-UI Overview
    url: https://docs.ag-ui.com/
    author: AG-UI Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    supports:
      - identity-has-to-survive-the-turn
---

# Preserving card state across retrieval turns

State continuity in a generated interface is a known problem. It gets harder
when a turn changes not just the rendering but the *knowledge* — because now
there are two things that could have changed and the reader's position depends
on both.

## Three states, and only one is disposable

**Conversation state** — the questions asked and responses given. Appended to,
never rewritten.

**Knowledge state** — the corpus version, the retrieved evidence, the source
metadata. Replaced per retrieval, and the replacement is the point of the turn.

**UI state** — which sections are expanded, which entities are selected, where
the reader is. Authored by the reader; nothing regenerates it.

The rule that follows: UI state must never be the source of truth for
knowledge. If a citation is read out of what the reader has expanded, then
collapsing a section changes what the system claims — which is absurd, and easy
to build by accident when both live in the same component tree.

## Identity has to survive the turn

Preserving expansion across a new response requires knowing that *this* card is
the same card as before. Two ways to decide, and only one works.

**Position.** The second card stays expanded. Cheap, and wrong the moment
ordering changes — the reader's state reattaches to a card they never opened,
which is worse than losing it, because it looks deliberate.

**Stable identity.** A card carries an identifier derived from what it is
about, so a comparison of the same entities is recognisably the same card
across turns.

The second is more work and it is the only one that degrades gracefully. When
identity genuinely changes, state is legitimately lost; when it does not, state
survives.

The event-based agent protocols push the same conclusion from the transport
side: state travels as deltas rather than whole snapshots, and a delta is
meaningless without stable identities to apply it to.

## Evidence identity underneath

There is a second identity problem below the cards. A follow-up runs a new
retrieval, and a passage retrieved in both turns must be recognisable as the
same passage — or the reader who expanded it sees it collapse and reappear as
something new.

This is where stable evidence identifiers stop being an evaluation convenience
and become a UI requirement. If identifiers rotate on re-retrieval, no card
state can be preserved, because nothing in the new response is identifiable as
anything from the old one.

## The reader who explores most loses most

Worth stating plainly because it inverts the incentive the interface is trying
to create.

State loss is proportional to engagement. A reader who expanded nothing loses
nothing; a reader who explored six sources, added two entities to a comparison,
and then asked a follow-up loses all of it. The follow-up is the signal that
they are engaged, and the system answers it by resetting them.

The malleability argument makes the same point in a longer arc: what the user
shapes is the durable artefact, and a system that regenerates freely while
treating adaptation as ephemeral has the value backwards.

## What this means here

Card-state preservation across follow-up turns is a named success metric. The
design has explaining further append cards rather than regenerate the response,
keeps interaction state outside the rendered tree keyed to card identity rather
than position, and requires a test asserting that mutating UI state leaves
rendered citations unchanged. Those are M2 and M4, and none of them is built.

The one piece already in place is underneath: the evidence identifier rule —
derived from document, section, position, and content hash — is implemented and
its stability is tested. It is load-bearing for card state, not only for
reproducible evaluation, which is why it was settled first.