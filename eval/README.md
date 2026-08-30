# Evaluation set

Sixty manually written questions with golden evidence and expected card types.

```bash
pnpm eval:build      # regenerate questions.jsonl from questions.ts
pnpm eval:check      # fail if questions.jsonl is stale
pnpm eval:validate   # resolve every golden identifier against the real chunk set
```

| File | Role |
| --- | --- |
| `questions.ts` | Source of truth. Golden evidence as structural references. |
| `questions.jsonl` | Generated. Same questions with evidence identifiers resolved. |

## The labels exist before the system does

Card-type selection accuracy and Recall@K are both scored against these labels.
Ground truth written after the thing it measures is ground truth shaped by the
results — so the set was authored in M0, before any retrieval or planner exists.

Writing it early also surfaced what the metrics actually need. Card-type
accuracy is scored against a **set** of acceptable types rather than one value,
because several questions legitimately admit more than one good presentation and
scoring against an arbitrary choice would count a defensible answer as wrong.

## Golden evidence is structural, then resolved

`questions.ts` labels evidence as `{ documentId, section, chunkIndex }`.
`questions.jsonl` carries the resolved identifiers.

Identifiers embed a content hash, so editing a paragraph moves one. Labels
written as identifiers would need re-checking by hand after every corpus edit;
a structural reference survives an edit and fails loudly on a rename.

Two checks guard the pair, and they catch different things:

- **`eval:check`** regenerates and compares. A stale `questions.jsonl` is the
  dangerous case — it resolves cleanly against yesterday's chunk set and
  silently mismeasures recall.
- **`eval:validate`** resolves every identifier against the chunk set the
  chunker produces now, and reports the corpus version the labels were written
  against. A well-formed identifier that resolves to nothing would pass every
  shape check while removing its question from the recall denominator.

Both run in CI. The acceptance criterion for this set is that resolution is
checked by script rather than by review, because 141 identifiers is exactly the
quantity a reviewer skims.

## What the set contains

| | Count |
| --- | --- |
| Questions | 60 |
| Golden evidence references | 156 |
| RAG / Generative UI / Intersection | 25 / 23 / 12 |
| Deliberately unanswerable | 6 |

The domain split is proportional to the corpus, asserted with a tolerance of
two questions rather than by eye.

**Coverage is checked per section, not per note.** A note-level check passes
while an entire section goes unmeasured, which is how the first version of this
set left `embeddings-are-trained-for-a-comparison` — the central argument of its
note — with no question drawing on it, while the check stayed green because
other sections of that note were cited.

A section carrying no golden evidence must either gain a question or appear in
`UNMEASURED_SECTIONS` with a written reason. Silence is not an option, and
neither is a stale exemption: an exemption naming a section that turns out to be
measured fails validation, because an exemption nobody needs is a standing
permission rather than a judgement. Three of the first ten were stale.

Currently 78 sections are deliberately unmeasured, almost all of them structural
— every note's preamble and its closing `What this means here`, neither of which
answers a knowledge question about the note's subject.

The unanswerable questions are adjacent to covered topics rather than absurd:
vector database pricing, embedding benchmark scores, pgvector tuning. A system
that only declines obviously off-topic questions has not been tested on the case
that matters, which is a plausible question the corpus happens not to cover.

## Who labelled this

The questions, the golden evidence, and the acceptable card-type sets were all
written by the same person who wrote the notes. That is worth knowing before
reading any number derived from them.

It matters most for Recall@K, whose denominator is entirely determined by these
labels: a chunk a correct answer needs but the label omits will be scored as
noise when retrieval finds it. Whether a cited chunk genuinely supports its
question is a judgement, and no check can be built for it — the mechanical
checks here establish that the labels resolve, not that they are right.

## Sample size

Sixty questions across three domains and five card types leaves roughly a dozen
per cell. Mechanical results are determinate from one run; anything involving
model choice needs repetitions with dispersion reported, and a per-cell result
supports a direction at best.

[PROTOCOL.md](PROTOCOL.md) pins the rest: the model, effort, prompt version,
corpus version, and repetition count every run records, which metrics may be
concluded from one run, and how token spend is reported. Note that on the pinned
model there is no `temperature` to fix — sampling parameters are removed — so
variance is measured rather than configured away.
