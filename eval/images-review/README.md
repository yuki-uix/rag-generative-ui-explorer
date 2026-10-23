# PR #92 review controls

Read [review findings and corrections](REVIEW.md) before interpreting the original
pilot. This post-hoc control fixes the missing variable isolation; it does not
silently relabel or replace the original frozen experiment.

```sh
# Root directory; fresh output directory required. No model, OCR, key or network.
pnpm images:review --out /absolute/path/to/fresh/review-output
```

The command verifies the original and new freeze/observation seals and the 3 MiB
control budget, then recomputes the 52-row original gold audit, source/tie analyses
and all 648 new scored rows. Search timing is measured again; original encoder
and OCR timing remain separate historical observations. Ranking IDs and metrics
match exactly; numeric scores use the same 1e-12 cross-runtime tolerance as v1.

New real observations were created after `freeze-controls.ts`, using:

```sh
swift -module-cache-path /absolute/path/to/cache \
  packages/corpus/scripts/images/ocr.swift eval/images-review \
  eval/images-review/artifacts/ocr.json
pnpm --filter @rgux/corpus exec node --import tsx scripts/images/encode-controls.mjs
```

These are explicit authoring commands with write-once outputs, not CI commands.
The encoder requires the six v1 local model/tokenizer/processor files with exact
recorded hashes and disables remote models. Raw FP32 LE passes store 24 images
and 54 query rows each (512 dimensions), with metadata row order/hash/timing.
They are three independently executed passes, not three copies of fixture vectors.

All drawings are repository-authored MIT illustrative controls. Source snapshots
remain in the immutable original corpus and are hash-checked. No arrows are used
in the control diagrams: their labels are concept names, not algorithm steps.
The separate [corrected query-transformation drawing](corrections/query-transformation.png)
is an erratum, not a replacement image indexed under a frozen original ID.
