# @rgux/corpus

Note metadata validation and manifest generation for `knowledge/`.

```bash
pnpm corpus:validate      # validate notes, fail if the manifest is stale
pnpm corpus:build         # validate and rewrite knowledge/manifest.json
pnpm corpus:check-links   # request every canonical URL (network)
pnpm corpus:validate --check-urls   # both, for local use
```

## A note is not its sources

`title` and `author` describe **the note** — original prose written for this
repository. `sources` describe what it draws on, and a note may cite several.

The first version conflated them: a note's `title` was the cited paper's title
and its single `url` was the paper's. Ingestion carries frontmatter onto every
chunk, so every chunk of the repository's own analysis would have been displayed
under that paper's name and link, and a reader following the citation would find
nothing resembling the text they clicked from. Every mechanical check passed,
because the misattribution was in the data rather than in the code.

Three gates now hold that line:

- `title` must match the note's top-level heading, checked at build time. The
  original bug is exactly a title/heading divergence, so it cannot recur
  silently.
- Every source a note draws on belongs in `sources`, with exactly one marked
  `primary`. A note whose content outruns its citations was the second half of
  the same defect — three notes discussed techniques from papers they never
  cited.
- Every source lists the section slugs it `supports`, and the relationship is
  checked in both directions. A slug matching no heading is a source claiming
  more than it gives; a heading no source claims is a section drawing on
  something uncited. Both defects reached review before the field existed, in
  opposite directions, and neither was visible to any check over `sources`
  alone — the relationship being asserted is between a source and a passage,
  and nothing recorded it.

Sections that genuinely rest on no external source go in `UNSOURCED_SECTIONS`
with a reason, keyed per note so exempting one note's heading does not exempt
every note reusing the wording. An exemption for a section a source does claim
fails, because an exemption nobody needs is a standing permission.

30 of the corpus's sections are the repository's own analysis and are listed
there. That figure was invisible before the field existed.

**Downstream this is only half done.** Ingestion must populate
`Evidence.documentTitle` from the note title and must not copy a source URL onto
a chunk; see the M1 ingestion issue.

The required-field tests are driven off a field list rather than written case by
case, so a field added to the schema without being added to that list shows up
as an untested one.

## Topic tags are a controlled vocabulary

`tags` must come from `src/topics.ts`, whose labels mirror the topic bullets in
`docs/KNOWLEDGE_SCOPE.md`. `topics.test.ts` parses that document and asserts the
two agree in both directions.

Free-form tags would make the coverage criterion in M0.5–M0.7 ("every Domain A
topic is covered by at least one note") uncomputable: with forty notes carrying
ad-hoc tags, coverage could only be established by reading all forty. `pnpm
corpus:validate` prints per-domain coverage and names the uncovered topics.

## `domain` must match the directory

The directory READMEs said so in prose, which meant nothing checked it. A note
under `knowledge/rag/` declaring `domain: generative-ui` validated cleanly and
would have counted towards the wrong domain's coverage.

## The corpus version covers the whole frontmatter, not the manifest projection

`corpusVersion` hashes each document's body plus a `metadataHash` taken over the
*complete* frontmatter — not over the fields the manifest happens to surface.

The first version of this package hashed the manifest documents, which omitted
`license`, `published`, `retrieved`, and `summary`. Editing any of those changed
nothing, so two materially different corpora reported the same version, and any
evaluation result keyed on it would have compared silently across the change.
The sensitivity test now iterates `frontmatterFields()` rather than naming
fields by hand — the earlier test named two, and both happened to be fields the
manifest projected.

Body hashing normalises whitespace, matching `makeEvidenceId` in
`@rgux/contracts`, so reflowing a paragraph without changing its words moves
neither the evidence IDs nor the corpus version.

## Link checking runs on a schedule, not on pull requests

A URL can be perfectly well-formed and still 404. Checking syntax alone would
report the corpus as sound while a citation points at nothing, which is the
failure this exists to catch — so the check actually requests each URL.

It is not in the merge gate. Requiring a third party's uptime before an
unrelated change can merge produces a check that people re-run until it passes,
which is worse than not having one. It runs weekly and on demand, and reports
what has rotted. `pnpm corpus:validate --check-urls` runs both locally.

A persistent 403 is reported as `BLOCK` rather than `FAIL`. Publishers behind a
bot filter answer 403 to an automated request while serving the document to a
person, and counting that as rot would train everyone to ignore the report.

The unit tests inject `fetchImpl`, so they stay offline and deterministic. Only
the scheduled workflow touches the network.

## What is validated but not ingested

Every `README.md` and every `_`-prefixed file under `knowledge/` is parsed and
validated but kept out of the manifest. That way `knowledge/_template.md` is
checked by the same code path as a real note — a broken template fails CI
instead of being copied into thirty notes.
