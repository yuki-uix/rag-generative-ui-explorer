# @rgux/corpus

Note metadata validation and manifest generation for `knowledge/`.

```bash
pnpm corpus:validate      # validate notes, fail if the manifest is stale
pnpm corpus:build         # validate and rewrite knowledge/manifest.json
pnpm corpus:check-links   # request every canonical URL (network)
```

## Frontmatter is a discriminated union, not a bag of optional fields

`docs/KNOWLEDGE_SCOPE.md` lists four kinds of source, and the fourth — original
notes written for this repository — has no canonical URL, publication date, or
upstream licence to record.

Making those fields optional for every note would push the difference into
review, where "this external note is missing its licence" is exactly the kind of
thing that gets waved through. Instead `sourceType` discriminates: an external
note without a URL fails, and an original note claiming an upstream licence
fails too. Both directions are tested.

The required-field tests are driven off a field list rather than written case by
case, so a field added to the schema without being added to that list shows up
as an untested one.

## The corpus version covers metadata, not just prose

`corpusVersion` is a hash over every document's metadata and body. Retagging a
note or correcting its author changes what retrieval and evaluation see, so a
version derived from body text alone would report two materially different
corpora as the same one — and every stored evaluation result keyed on it would
silently compare across the change.

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
what has rotted.

The unit tests inject `fetchImpl`, so they stay offline and deterministic. Only
the scheduled workflow touches the network.

## What is validated but not ingested

Every `README.md` and every `_`-prefixed file under `knowledge/` is parsed and
validated but kept out of the manifest. That way `knowledge/_template.md` is
checked by the same code path as a real note — a broken template fails CI
instead of being copied into thirty notes.
