---
title: Sandboxed open-ended HTML generation
domain: generative-ui
tags:
  - sandboxed-html
summary: What a sandbox actually contains when a model emits markup, which browser mechanisms do the containing, and what no sandbox can give back.
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
  - sourceType: documentation
    title: <iframe> HTML inline frame element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
    author: MDN contributors
    published: 2026-08-04
    retrieved: 2026-08-29
    license: CC BY-SA 2.5. Short attributed quotations only; published is the page last-modified date.
  - sourceType: documentation
    title: Content Security Policy (CSP)
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
    author: MDN contributors
    published: 2026-03-22
    retrieved: 2026-08-29
    license: CC BY-SA 2.5. Short attributed quotations only; published is the page last-modified date.
---

# Sandboxed open-ended HTML generation

Letting a model emit markup that the host runs is the most expressive form of
generative UI and the only one where the security model must assume the output
is hostile. That assumption is not pessimism about models; it is the
recognition that the output is code from a source nobody reviewed.

## What the browser provides

Two mechanisms do the containing, and they are complementary rather than
alternatives.

**Frame sandboxing.** An embedded frame can be given a restricted set of
permissions, with everything not granted denied: no script, no form submission,
no top-level navigation, no popups, and a unique origin that cuts it off from
the embedder's storage and DOM. Permissions are then granted back individually,
and each grant is a decision to be justified.

The trap is a combination that dissolves the boundary. Granting a frame both
script execution and same-origin treatment together gives the framed content
access to the embedder's origin — and from there it can remove its own sandbox
attribute. Two permissions that are each defensible are jointly equivalent to
no sandbox at all.

**Content Security Policy.** A policy declaring which sources of script, style,
image, and connection are permitted. It is what stops framed content from
reaching the network, loading remote script, or exfiltrating what it can see.

Sandboxing limits what the content can do to the page. CSP limits what it can
reach beyond the page. Neither substitutes for the other.

## What a specification for this looks like

The interactive-UI extension for the tool protocol is a useful reference
because it commits to specifics rather than advice. Its security model has four
parts: all UI content runs in sandboxed frames with restricted permissions;
templates are predeclared so a host can review the HTML before rendering it;
every message from the UI to the host goes through JSON-RPC and is therefore
loggable; and hosts can require explicit user approval for UI-initiated tool
calls.

The predeclaration point is the one most often skipped elsewhere. UI declared
in advance as a resource can be reviewed once and cached; UI arriving inline
with each tool result cannot be reviewed at all, and the specification's own
rationale names the review process as a reason for the choice.

The auditable-channel point matters for the same reason. A shared global object
injected into the frame is host-specific and invisible; a message channel can
be logged, and a call that happened can be reconstructed afterwards.

## What no sandbox gives back

A sandbox contains damage. It does not confer any of the properties that make
an interface good.

**Accessibility is not contained or granted.** Generated markup is accessible
if it happened to be generated that way, per instance, with no floor.

**Consistency is not enforced.** Two answers to similar questions look
different, and the difference carries no meaning, which is a cost paid by every
reader who tries to learn the interface.

**Correctness is unaffected.** A sandboxed page can present wrong information
as confidently as an unsandboxed one. The sandbox is about what the code can
*do*, never about what the content *says*.

And one specific to interfaces built on citation: a sandbox cannot prevent the
generated markup from *looking* like the host's own chrome. Visual authority is
not a permission the browser mediates.

## What this means here

Out of scope, explicitly: no arbitrary HTML, CSS, or JavaScript generation, and
zero executable model-generated code rendered in the browser is an exit
criterion rather than a preference — a binary property that can be tested
rather than argued.

Corpus text is to be treated as untrusted for the same reason and sanitised
before rendering, with a fixture note containing script-like text asserting it
renders inert — specified in M2, not yet built. The model never authors markup
in this design, so the sandbox is not the outer defence here; it is the defence
that is not needed because the boundary sits further back.