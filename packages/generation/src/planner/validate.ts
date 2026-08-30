import type { Evidence, KnowledgeCard as Card } from '@rgux/contracts';
import { KnowledgeCard } from '@rgux/contracts';

export type ValidationStage = 'schema' | 'evidence-reference' | 'policy';

export interface ValidationFailure {
  /** Which stage refused it. Logged, so a failure names its own cause. */
  readonly stage: ValidationStage;
  /** Index of the card in the planner's output, or `-1` for the envelope. */
  readonly cardIndex: number;
  readonly message: string;
  /** Path inside the card, where the stage can locate one. */
  readonly path?: string;
}

export interface ValidationResult {
  /** Cards that passed every stage. Only these may render. */
  readonly cards: readonly Card[];
  readonly failures: readonly ValidationFailure[];
}

/**
 * Three ordered stages between model output and render.
 *
 * Ordered because each depends on the last holding: an object that is not a
 * card cannot be asked which evidence it cites, and a citation that resolves to
 * nothing cannot be checked for whether the words match. A card that fails a
 * stage stops there and is reported once, rather than producing a cascade of
 * consequential complaints that bury the first real one.
 *
 * Every stage is per-card. One bad card does not discard the others: the
 * planner is asked for the smallest useful set, and dropping a good card
 * because a sibling was malformed would silently narrow an answer the reader
 * would have no way to notice was narrowed.
 */
export function validateCards(
  raw: readonly unknown[],
  retrieved: readonly Evidence[],
): ValidationResult {
  const retrievedIds = new Set(retrieved.map((item) => item.id));
  const byId = new Map(retrieved.map((item) => [item.id, item]));

  const cards: Card[] = [];
  const failures: ValidationFailure[] = [];

  raw.forEach((candidate, cardIndex) => {
    // Stage 1: schema. Zod is the authoritative gate — the generated JSON
    // Schema drops cross-field rules silently, so it cannot stand in here.
    const parsed = KnowledgeCard.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const path = issue.path.join('.');
      failures.push({
        stage: 'schema',
        cardIndex,
        message: issue.message,
        ...(path ? { path } : {}),
      });
      return;
    }

    const card = parsed.data;

    // Stage 2: evidence reference. Against *this generation's* retrieval set,
    // never the corpus. An identifier naming a real chunk that was not
    // retrieved is still fabricated: the model could not have read it, so a
    // claim resting on it is unsupported. Checking the corpus would let exactly
    // that through.
    const cited = groundedFields(card);
    const absent = cited.filter(({ field }) =>
      field.evidenceIds.some((id) => !retrievedIds.has(id)),
    );
    if (absent.length > 0) {
      // Every offending field, not the first. Stages short-circuit because a
      // later stage cannot run on what an earlier one rejected, but within a
      // stage there is nothing to gain from reporting one field at a time —
      // that turns fixing into whack-a-mole for no diagnostic benefit.
      for (const { path, field } of absent) {
        const missing = field.evidenceIds.filter((id) => !retrievedIds.has(id));
        failures.push({
          stage: 'evidence-reference',
          cardIndex,
          path,
          message: `cites ${missing.join(', ')}, which the retrieval set for this generation does not contain`,
        });
      }
      return;
    }

    // Stage 3: policy.
    //
    // The three rules #24 names — every factual field carries evidence,
    // `inferred` content cites it, an incomplete response carries a reason —
    // are all schema invariants already: `GroundedText.evidenceIds` is
    // `.min(1)` and the response is a discriminated union on `incomplete`.
    // Measured rather than assumed: each was tried against Zod and refused.
    // Writing them again here would be a stage that cannot fail, which is worse
    // than no stage because it looks like coverage.
    //
    // What Zod cannot express is whether `extractive` is true. That is a claim
    // about provenance, checkable against the passage, and it has already
    // caught a real defect — a sentence attributed to the wrong note, where the
    // identifier existed and the words were not its.
    const misattributed = cited.filter(
      ({ field }) =>
        field.mode === 'extractive' &&
        !field.evidenceIds.some((id) => containsVerbatim(byId.get(id)?.text ?? '', field.text)),
    );
    if (misattributed.length > 0) {
      for (const { path, field } of misattributed) {
        failures.push({
          stage: 'policy',
          cardIndex,
          path,
          message: `is marked extractive but its words are not in ${field.evidenceIds.join(', ')}`,
        });
      }
      return;
    }

    cards.push(card);
  });

  return { cards, failures };
}

interface GroundedField {
  readonly path: string;
  readonly field: { text: string; mode: string; evidenceIds: readonly string[] };
}

/**
 * Every grounded field in a card, with where it sits.
 *
 * A switch on the discriminator rather than a recursive walk: a walk would
 * silently cover a field added later without anyone deciding it should be
 * covered, and the `never` branch makes a new card type a build error instead.
 */
function groundedFields(card: Card): GroundedField[] {
  switch (card.type) {
    case 'definition':
      return [
        { path: 'definition', field: card.definition },
        ...card.keyPoints.map((field, i) => ({ path: `keyPoints.${i}`, field })),
      ];
    case 'comparison':
      return card.rows.flatMap((row, r) =>
        row.values.map((field, v) => ({ path: `rows.${r}.values.${v}`, field })),
      );
    case 'mechanism':
      return card.stages.map((stage, i) => ({
        path: `stages.${i}.description`,
        field: stage.description,
      }));
    case 'procedure':
      return card.steps.map((step, i) => ({
        path: `steps.${i}.instruction`,
        field: step.instruction,
      }));
    case 'evidence':
      // Carries identifiers, not grounded text: its excerpts are rendered from
      // the corpus, so there is no claim of its own to check.
      return [];
    default: {
      const unhandled: never = card;
      throw new Error(`No grounded-field rule for ${String((unhandled as { type?: string }).type)}`);
    }
  }
}

/**
 * Whitespace and Markdown emphasis are normalised away: the corpus is Markdown
 * and a card renders plain text, so `*possible*` and `possible` are the same
 * words. Nothing else is normalised — the point is that the words and their
 * order are the passage's.
 *
 * **The gap, measured rather than guessed at.** A substring match has no floor,
 * so a short enough fragment can match a passage it did not come from. Tried
 * against an unrelated passage: a ninety-character lift, ten words, five words,
 * and even three common words are all refused; a single common word passes.
 * That is the whole of it.
 *
 * No minimum length is imposed, because any threshold would be a number picked
 * to close a gap rather than one anything supports — and a factual field whose
 * text is one word is unusable for reasons this check is not responsible for.
 * If a planner is ever seen shortening `extractive` fields, that is the signal
 * to revisit, and it would be a finding rather than a guess.
 */
function containsVerbatim(passage: string, text: string): boolean {
  const normalise = (value: string) =>
    value.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return normalise(passage).includes(normalise(text));
}
