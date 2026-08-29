---
title: The MCP Apps design decisions
domain: generative-ui
tags:
  - agent-ui-protocols
  - sandboxed-html
summary: Predeclared UI resources, reused JSON-RPC, and an HTML-only first version — three choices whose stated rationale is mostly about what can be reviewed.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: specification
    title: "SEP-1865: MCP Apps - Interactive User Interfaces for MCP"
    url: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
    author: Ido Salomon, Liad Yosef, Olivier Chafik et al.
    published: 2025-11-21
    retrieved: 2026-08-29
    license: Status Final, Extensions Track. Short attributed quotations only; published is the SEP Created date.
    primary: true
  - sourceType: specification
    title: MCP Apps extension specification, revision 2026-01-26
    url: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
    author: Model Context Protocol contributors
    published: 2026-01-26
    retrieved: 2026-08-29
    license: Short attributed quotations only; published is the dated specification revision.
---

# The MCP Apps design decisions

This extension is worth reading closely, not because this project adopts it,
but because it is a rare case of a UI protocol that writes down why it chose
each alternative. The reasoning is a better artefact than the conclusions.

## The problem it names

A tool protocol lets a model reach capabilities and data, exchanging text and
structured results. That works until a tool needs to present visual information
or collect complex input, at which point every host solves it differently:
hosts cannot rely on UI support existing, behaviours diverge, security patterns
are inconsistent, and developers maintain per-host adapters.

The extension is explicitly a unification of approaches that already existed in
practice, taking its design from community and vendor implementations that
demonstrated demand before standardisation.

## Predeclared resources rather than inline embedding

UI is modelled as resources declared in advance under a `ui://` scheme, which
tools then reference through metadata. The alternative — returning the UI
inline with each tool result — is acknowledged as more convenient for the
server developer and was deferred anyway.

Three reasons are given, and the third is the interesting one: hosts can
prefetch templates before a tool runs; presentation is separated from data so
templates cache while results vary; and UI resources can be **security
reviewed**.

That last reason only works because of predeclaration. Markup arriving fresh
with every tool result cannot be reviewed by anyone — there is no artefact that
persists long enough to look at. Declaring it in advance turns an unreviewable
stream into a finite set of things.

The pattern generalises past this protocol: if you want a review step, the
thing being reviewed has to exist before the moment it is used.

## Reusing JSON-RPC rather than a custom protocol

Communication between the UI and the host runs over the tool protocol's
existing JSON-RPC rather than a bespoke message vocabulary. The stated gains
are reuse of existing type definitions and SDKs, and access to what JSON-RPC
already handles — timeouts, errors, correlation.

The rejected alternative is more instructive than the chosen one. A global API
object injected into the frame was rejected because it requires host-specific
injection and does not work for externally sourced frames.

There is a second consequence the security model depends on: a message channel
is auditable and a global is not. Every UI-to-host call goes through something
loggable, so what a UI did can be reconstructed afterwards. An injected global
is a function call that leaves no trace.

## HTML-only, deliberately

The first version supports HTML and nothing else. The reasons given are that
HTML is universally supported, has the simplest security model — the standard
frame sandbox — permits screenshot and preview generation, and covers most
observed cases.

External URLs were considered and deferred despite being the easiest thing for
servers to adopt, over concerns about model visibility, the inability to
capture the content, and the review process again.

The shape of the argument is worth extracting: the narrower option was chosen
because it is the one that can be *inspected*, not because it is the one that
does most.

## The security model

Four mitigations, stated together: sandboxed frames with restricted
permissions; predeclared templates a host can review before rendering;
UI-to-host communication over loggable JSON-RPC; and hosts able to require
explicit user approval for UI-initiated tool calls.

They are layered rather than alternative. Sandboxing limits what the content
can do; predeclaration allows review before it runs; auditability makes what it
did reconstructable; consent puts a person in front of consequential actions.
Remove any one and the others still leave a gap.

The extension is also optional and negotiated — existing implementations keep
working — which is a property worth noting separately: a security model that
forces an upgrade tends to get bypassed.

## What this means here

This project sits on the other side of the choice this extension makes. It does
not render model-authored markup at all, so it needs neither the sandbox nor
the predeclaration.

What transfers is the reasoning. Predeclared and reviewable beats convenient
and inline; an auditable channel beats an invisible one; a narrower first
version that can be inspected beats a broader one that cannot. The validated
card specification, the closed component lookup, and the planned logging of raw
model output before any repair are the same three arguments applied to a
different boundary — the first exists today, the other two are M2 and M1.