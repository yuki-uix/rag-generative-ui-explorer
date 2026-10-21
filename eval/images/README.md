# Independent image retrieval

A small text / OCR / CLIP retrieval experiment. [Tasks](TASKS.md),
[frozen protocol](PROTOCOL.md), [manifest](manifest.json),
[questions and relevance labels](questions.json), [input freeze](freeze.json).
See [measured findings, timing and failures](FINDINGS.md),
[all original results](results/2026-10-21/report.md) and the [image gallery](GALLERY.md).
The product does not gain image understanding from this experiment. No LLaVA,
answer model, image UI, F5 change or modification of the original 60 questions.

## Reproduce saved measurements offline

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
pnpm images:budget
pnpm images:replay --out /absolute/path/to/a/fresh/output-directory
```

This reparses actual saved OCR and all three measured CLIP encoding passes,
checks frozen inputs/code and the sealed observation hashes, recomputes rankings/metrics with the existing BM25,
and writes `records.jsonl`, `summary.json`, `report.md`. It needs no model,
Apple Vision, API key or network. Search and index timings are measured afresh
by each replay; saved OCR/CLIP timings belong to the original extraction/encoding
run. Image-ID order and metric values must match exactly. BM25 score last bits can
differ between Linux x64 and macOS arm64 math runtimes; tests require scores
within `1e-12 * max(1, abs(original))`, while rejecting any ranking/metric drift.
Wall-clock timings are not byte-identical.
CI performs this replay on Linux. Original observations are never overwritten.

## Make new local observations explicitly

Apple Vision extraction needs macOS and Swift. CLIP encoding needs Node and the
existing corpus package's Transformers.js dependency; the first run downloads
~154 MB of q8 ONNX weights plus tokenizer/processor files. The exact files and
SHA256 identities appear in the measured encoding artifact. Local inference
uses CPU, not a hosted inference endpoint.

```sh
# From the repository root: write a NEW OCR observation.
swift -module-cache-path /absolute/path/to/swift-cache \
  packages/corpus/scripts/images/ocr.swift eval/images \
  /absolute/path/to/new-ocr.json

# From the repository root: independently compute three NEW encoding passes.
pnpm --filter @rgux/corpus exec node --import tsx \
  scripts/images/encode.mjs /absolute/path/to/new-encoding.json
```

The explicit commands refuse to overwrite files. New outputs do not replace the
committed comparison automatically. A new corpus/config/protocol requires a new
freeze and clearly separated results; do not edit labels after looking at
rankings. `freeze.ts` is an authoring step, not a routine replay step. Rebuilding
original authored PNGs uses `python3 eval/images/build-corpus.py` with
Pillow==12.2.0; any resulting byte drift is detected by the freeze.

## What is measured

24 diagrams, two per source note; 12 source-note groups; 52 English queries:
24 literal-label queries, 12 conceptual-flow queries, 12 layout queries and four
negative queries. Six source groups and two negative queries are development,
the remaining six groups and two negatives are evaluation. All arms search the
same entire candidate corpus. Each answerable query has one authored relevant
image. This exposed, same-author diagnostic set is not an independent benchmark;
conceptual alternatives and general relevance need independent review before
expanding it into an effectiveness claim.

- **Text:** actual existing BM25 over paired note bodies. Two images from the
  same note have identical text, so exact-score ties are expected and resolved
  by ID. This is not the production dense/fused text retrieval configuration.
- **OCR:** Apple Vision revision 3 reads image pixels; recognized arrow artifacts
  and mistakes remain in the text. The BM25 index never receives the rendered
  node labels directly from `manifest.json`.
- **CLIP:** fixed Xenova ONNX conversion of OpenAI CLIP ViT-B/32; q8 text/vision
  projection encoders, CPU, normalized cosine, no fine-tuning or query template.
  Conversion/quantization are part of this baseline, not a result for every CLIP
  implementation. [Original model card](https://github.com/openai/CLIP/blob/main/model-card.md)
  limits the original model's intended language scope to English.

No threshold is fitted. A top neighbor for a negative question is retained as
a diagnostic, not called a justified answer or successful refusal. OCR/cosine
retrieval says nothing about whether an answer faithfully reads an arrow.

## Source identity and size boundary

All diagrams are repository-authored MIT teaching illustrations. Source snapshots
are the repository's own notes at commit `37813a2`; references in those notes do
not make the diagram a figure from the referenced paper. Each PNG and exact
snapshot is hash-bound. The original `knowledge/` tree is unchanged.

All committed files beneath this experiment are covered by a 5 MiB budget,
including newly added artifacts and docs. Model cache and disposable replay
runs are ignored and excluded. `pnpm images:budget --max-bytes 1` intentionally
fails, proving enforcement rather than merely printing a size. Weights never
belong in the source tree or browser/Worker bundle.
