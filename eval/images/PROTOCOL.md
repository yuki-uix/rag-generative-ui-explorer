# I1: text / OCR / CLIP image retrieval pilot

Protocol version `image-retrieval-1`, 2026-10-21. Freeze this file, config,
manifest, questions and source/image bytes before the first model encoding.
This is a new baseline, independent of F5 and `eval/questions.jsonl`.

## Question and candidate boundary

24 repository-authored teaching diagrams, two per source note, not figures
reproduced from the papers those notes cite. Each retains the exact source-note
snapshot, source commit/path/hash, image hash and rendering specification.
The diagrams illustrate selected concepts rather than every claim in a note.
Labels identify relevant images, not whether a generated answer is correct.
No LLaVA, answer generation, UI, training, query translation or query rewriting.
English-only primary queries follow the original CLIP model card.

Every arm ranks the same 24 image IDs; K = 1, 3, 5. Index candidates include
both development and evaluation documents, as in retrieval over a fixed corpus.
Query labels are grouped by source note: development and evaluation source
groups cannot overlap. The author of the data also wrote the questions and
harness: this is an exposed authored diagnostic set, not a blind benchmark.
Queries and labels are not rewritten after seeing rankings. OCR is not corrected
by hand. Render labels and reference answers are not substituted for OCR.

## Fixed arms and allowed differences

- `text`: existing repository BM25 (`k1=1.2`, `b=0.75`, existing tokeniser),
  over the paired source-note body, with one candidate per image. Both diagrams
  from one note share the same text: text ties are expected and not broken using
  questions, image names or labels. This is an adapted existing lexical baseline,
  not the product's text-dense/fusion baseline or its original 60-question score.
- `ocr`: identical BM25 implementation and parameters, over raw Apple Vision
  recognized text only. Accurate recognition, English, correction disabled;
  actual request revision, OS/build, line boxes/confidence and extractor hash
  recorded. No image title, file name, caption or note text enters this arm.
- `clip`: Xenova conversion of OpenAI CLIP ViT-B/32, fixed repository revision,
  q8 ONNX text and vision projection models, Transformers.js 3.8.1, CPU execution.
  L2-normalized 512-dimensional vectors, cosine dot product, raw question string
  with no prompt template. Exact processor/tokenizer and model-file hashes,
  effective resize/crop settings, device and runtime versions are recorded.
  Query length is checked before execution; truncation is refused, not hidden.

Score descending, then image ID ascending, for all exact ties. Similarities are
not probabilities and are not comparable across arms. No fusion, score
threshold or rejection rule is tuned in this pilot. Empty/OOV lexical queries
can return no candidates; CLIP generally still returns neighbors.

## Runs, metrics and costs

Three complete CPU encoding passes independently regenerate image and question
vectors; each pass is independently scored. All arms execute once per question
per pass in rotated order. Record every ranked candidate/score and per-query
search time; text/vision encoding, OCR and index construction are separate.
Fixed embeddings make ranking mechanical; repeated encoding checks runtime
stability. Latency is observational, with cold load/download reported separately
and warm inference/search marked explicitly. Report median and full range;
three repetitions are not three independent question sets.

Report Recall@1/3/5, hit@K, MRR@5 and binary nDCG@5, split and question category,
with denominators and per-query outcomes. Ranking metrics exclude questions
with no relevant image (denominator is null for an empty slice). Four negative
queries are diagnostic only: preserve their returned results; do not report
insufficient-evidence accuracy without a calibrated abstention rule.

Use the same complete artifacts for offline replay; verify protocol/config,
source, image, OCR, query, code and vector hashes, completeness, dimensions and
normalization. Saved tensors are measured real model outputs, not fixtures.
Offline replay makes no model download or API call. Explicit encode/extract
commands create new local observations and must never silently substitute
cached outputs as new inference. Freeze failures and expose stale inputs.

No hosted API calls are used. Provider invoice charge is zero for local
inference; wall time, process peak RSS, model bytes/download and derived data
size are measured separately. Hardware/electricity/engineering costs are
unpriced, not zero. Model weights/cache stay out of Git. The complete committed
experiment has a 5 MiB budget: protects clone/review/CI cost while allowing 24
small PNGs and three measured 512-dimension embedding passes; derived manifests
are checked exhaustively rather than listing a few output paths.

## Interpretation and acceptance

Publish at least one successful retrieval, one failure and one no-gain/regression
case (or state that a category was not observed). Preserve all arms, including
CLIP losses. Overlapping words, artificial layouts and shared rendering style
limit generalization. Layout-only questions deliberately test information absent
from paired text; report them separately from lexical/conceptual questions.
A poor CLIP result is acceptable: this pilot tests retrieval plumbing and
in-domain behavior, not a promised improvement or production adoption.

Official references: [CLIP implementation](https://github.com/openai/CLIP),
[model limitations and English scope](https://github.com/openai/CLIP/blob/main/model-card.md).
Existing requirements: issues #10 (frozen variables), #12/#13 (retrieval arms),
#17/#33 (observations/cost) and #63 (artifact growth). F5 #83 is not modified.
