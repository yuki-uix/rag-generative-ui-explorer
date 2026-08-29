# Knowledge corpus

Curated notes on RAG, Generative UI, and their intersection. `manifest.json` is
generated — run `pnpm corpus:build` after editing any note, and commit both.

Copy `_template.md` to start a note; it documents the required frontmatter.

## Notes describe design intent, not implementation status

Most notes end with a `## What this means here` section relating the subject to
this project. **Those sections describe what the design calls for. They are not
a report on what is built.** Implementation status lives in the issues and in
the code.

This distinction is load-bearing rather than pedantic. The corpus is this
system's own evidence base: once retrieval runs, a note claiming a behaviour
exists will be retrieved, cited, and rendered as a grounded claim — resolving
correctly, passing every mechanical check, and being false. The project's whole
argument is that it does not overstate its evidence, and the corpus overstating
its own maturity would be the first place that argument failed.

So, when writing:

- Say **"the design calls for"**, **"is specified to"**, or **"will"** for
  anything not yet built, and name the milestone where it helps a reader.
- Use the present tense only for what exists today — currently the contracts in
  `packages/contracts` and the corpus tooling in `packages/corpus`.
- Never write **"a test asserts X"** unless that test exists. Validation rejects
  the phrase outright; use the gerund ("a test asserting X") to describe a
  specification.

A review pass in August 2026 found thirty-four notes describing unbuilt
milestones in the present tense. It was caught by reading, not by a check, which
is why the narrow gate above exists and why this section does.

## Layout

| Path | Contents |
| --- | --- |
| `rag/` | Domain A — retrieval-augmented generation |
| `generative-ui/` | Domain B — generative UI |
| `intersection/` | Where the two meet; the evidence for cross-domain questions |
| `_template.md` | Starting point, validated like a real note but not ingested |
| `manifest.json` | Generated: every note, its sources, and the corpus version |

A note's `domain` must match its directory. `README.md` files and `_`-prefixed
files are validated but are not part of the corpus.
