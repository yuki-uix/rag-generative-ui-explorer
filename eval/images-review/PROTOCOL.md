# Review controls v1 — 2026-10-22

This is a **post-hoc diagnostic designed after observing the original pilot**.
Its own inputs and execution are frozen before new OCR/CLIP observations. It is
not a blind holdout, a relabelled original run or evidence for production adoption.
Original v1 images, labels, models, frozen code and records remain immutable.

## Review corrections

Original broad concept relevance was not exhaustively judged. In particular the
fusion concept query admits both diagrams; the query-transformation diagram
incorrectly places "Original intent" as a serial final stage. Record an erratum
and a separate corrected illustration, not a silent replacement under its old ID.
Original concept and layout aggregates must not drive a model-adoption ranking.
Literal queries are exact visible-label lookups, evaluated separately; they are
not semantic QA. Negatives remain uncalibrated diagnostics.

Report deterministic ranking and uniform-within-exact-score-tie expected hit@1
for original rows. Also report source-family hit@1, collapsing each candidate's
original document group: distinguish finding a source from distinguishing its
figures. These are descriptive post-hoc analyses using unchanged observations.
Full source text vs image-only OCR/CLIP is an information-availability comparison,
not a controlled algorithm comparison. Do not call the lexical adapter the
production dense/hybrid baseline or compare their published scores.

## Counterbalance control

24 new arrow-free diagrams: the six original evaluation source groups, four
variants each, fully crossing blue/orange with vertical-column/diamond positions.
All four variants in a source family have identical title, node words, dimensions,
font, canvas and box size. No ID or style words are printed. There are no arrows:
this tests physical color/arrangement, not dependency or workflow understanding.

54 questions: per family four color+position conjunctions (one positive each),
two color questions (two positives each), two position questions (two positives
each), and one topic-only question (all four positives). Gold is derived from
the frozen factorial attributes, independent of retriever output. Each family
contributes every style query, balancing ID tie winners. No source split is
claimed: these are already exposed topics and a shared rendering template.

Three core arms retain the original fixed BM25 and q8 CLIP parameters. A fourth
`visible-text-control` indexes the exact known printed words: an oracle-text
ablation, not OCR, not a deployable retriever, and not a fourth competing model.
It checks whether textual content alone can distinguish the four variants.
Actual OCR consumes PNG pixels only. No captions, styles, image filenames or
annotation attributes enter any lexical index. Preserve OCR errors unchanged.

For every question/arm/pass save full-corpus ranking and separately rank the
four source-family candidates. Family restriction is an explicit controlled
choice test, not an improvement of full-corpus retrieval. Report hit@1 for both,
chance/uniform-tie expectation, source-family hit@1, Recall@1/3/5, MRR@5 and nDCG@5.
Recall and hit differ with multiple positives. Report conjunction/color/layout/
topic slices separately. Topic-only query embeddings serve a matched ablation
for conjunction choices: when every one of four targets is asked once, a fixed
family-only topic winner scores exactly 1/4 without reading style.

Run actual Apple Vision revision 3 (accurate, English, correction off) and three
independent CPU q8 CLIP encoding passes. Same model revision and six recorded
model/tokenizer/processor files as original; local cached files only, no network
inference. Save raw FP32 model output tensors in little-endian binaries with
explicit row IDs, shapes, byte counts, hashes and timing; normalize at replay.
No model fitting, score threshold, query rewrite, LLaVA or answer generation.

Freeze config/protocol/generator, source hashes, question/image bytes and execution
code before observation. Bind binary/metadata/OCR outputs in a post-run ledger.
Replay verifies all coverage and factorial gold rules, exact printed-word equality
within each family, hashes and finite/nonzero vectors. Changed inputs are refused.
Record per-stage timing, peak RSS and original setup reuse. Local API inference
charge is zero; hardware/electricity/engineering remain unpriced. Three MiB bounds
this separate control corpus (24 PNGs, three 78×512 FP32 passes and complete scored rows).
The original experiment retains its own unchanged 5 MiB budget and freeze.
