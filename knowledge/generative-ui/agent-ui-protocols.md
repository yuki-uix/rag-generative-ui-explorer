---
title: Agent-UI protocols
domain: generative-ui
tags:
  - agent-ui-protocols
summary: AG-UI, A2UI, and MCP Apps occupy different layers and make different bets about where rendering authority sits.
author: yuki-uix
revised: 2026-08-29
sources:
  - sourceType: documentation
    title: AG-UI Overview
    url: https://docs.ag-ui.com/
    author: AG-UI Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
    primary: true
  - sourceType: documentation
    title: "A2UI: Agent-to-User Interface"
    url: https://github.com/a2ui-project/a2ui
    author: A2UI Project contributors
    retrieved: 2026-08-29
    license: Apache-2.0. Short attributed quotations only; no publication date stated.
  - sourceType: specification
    title: "SEP-1865: MCP Apps - Interactive User Interfaces for MCP"
    url: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
    author: Ido Salomon, Liad Yosef, Olivier Chafik et al.
    published: 2025-11-21
    retrieved: 2026-08-29
    license: Status Final, Extensions Track. Short attributed quotations only; published is the SEP Created date.
  - sourceType: documentation
    title: What is the Model Context Protocol (MCP)?
    url: https://modelcontextprotocol.io/
    author: Model Context Protocol contributors
    retrieved: 2026-08-29
    license: Living documentation; no publication date stated. Short attributed quotations only.
---

# Agent-UI protocols

Three efforts are usually mentioned together and they are not alternatives.
Placing them correctly is the difference between choosing one and stacking
them.

## The layers

The agent-user protocol's own documentation draws the map, and it is the
clearest statement of the division: one protocol connects an agent to tools and
data, another connects agents to each other, and a third connects an agent to
the person using it. They compose rather than compete.

**Agent to tools and data.** The tool protocol standardises how a model reaches
external capabilities and context. It says nothing about presentation.

**Agent to user.** An open, lightweight, event-based protocol standardising the
connection between an agent and a user-facing application, over ordinary web
transports. It defines a vocabulary of building blocks — streaming chat,
generative UI variants, shared state, thinking steps, tool calls, interrupts,
agent steering — as a stream of typed events rather than a request/response
exchange.

**Declarative agent-generated UI.** A format for representing updatable
agent-generated interfaces, plus renderers. The agent sends JSON describing the
*intent* of the UI; the client renders it with its own component library. Its
stated motivation is precisely the cross-trust-boundary case: agents that are
remote, or running somewhere the host does not control, still need to present
interfaces.

**Interactive UI inside a tool protocol.** The MCP Apps extension takes a
different position: UI resources are predeclared under a `ui://` scheme,
referenced by tools through metadata, and rendered as sandboxed HTML with
bi-directional JSON-RPC back to the host.

## The bet each one makes

The interesting comparison is over where rendering authority sits.

| | What the agent sends | Who decides appearance |
| --- | --- | --- |
| Event-based agent-user protocol | Typed events, incrementally | The client application |
| Declarative UI format | JSON describing intent | The client's component library |
| Interactive tool UI | Predeclared HTML resources | The server, inside a sandbox |

The first two keep appearance with the client, which is why they can accept
output from an untrusted agent without a sandbox: the agent never says how
anything looks. The third lets the server ship actual markup, which is more
expressive and requires the sandbox to be mandatory rather than advisory — and
that specification makes it mandatory, alongside predeclared templates a host
can review and an auditable message channel.

## Why the event model matters

Treating the agent-user connection as a stream of typed events rather than a
response has a consequence beyond streaming.

An event stream can carry things a response cannot: an interrupt, a state
delta, a request for input mid-task, a step the user can steer. Those are the
mechanics of mixed-initiative interaction, and a request/response shape cannot
express them — by the time there is a response, the opportunity to intervene
has passed.

## What this means here

None of these are adopted in the MVP, and it is worth being explicit that this
is a scope decision rather than a judgement about them.

This project is designed as a single application with its own retrieval and its
own renderer, and no remote agent to interoperate with. The protocols solve a
problem it does not have: crossing a trust or process boundary between whoever
decides the interface and whoever draws it. Adopting one would mean carrying
its vocabulary without needing its interoperability.

The design does borrow the position all three share. The model emits validated
structured intent; the renderer owns presentation. That is the same
architecture the protocols encode, applied within one process — which is also
why adopting one later would be a substitution rather than a redesign.