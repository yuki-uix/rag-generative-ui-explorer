import type { Evidence } from '@rgux/contracts';
import type { EvalQuestion } from '@rgux/corpus';
import type { GenerationRecord } from '../generate.js';

/**
 * Grounding metrics, computed from generation records.
 *
 * `eval/PROTOCOL.md` classifies every metric here as **model-dependent**: which
 * passages a model cites varies per run, so a single number is a sample. The
 * shape below therefore carries dispersion rather than a mean, and the report
 * refuses to print a bare figure for anything measured once.
 */
export interface Dispersion {
  readonly median: number;
  readonly min: number;
  readonly max: number;
  /** Repetitions that produced a value. Dispersion is across these. */
  readonly n: number;
  /**
   * Attempts that actually fed the number, summed across repetitions.
   *
   * Without it a rate computed from two comparable answers prints identically
   * to one computed from sixty — which is what happened in a pilot where three
   * of five responses were truncated and `insufficient accuracy` read 100% at
   * n=1. `n` counts repetitions; this counts the evidence underneath them.
   */
  readonly scoredAttempts: number;
}

export function dispersion(values: readonly number[], scoredAttempts?: number): Dispersion {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[middle]!
        : (sorted[middle - 1]! + sorted[middle]!) / 2;

  return {
    median,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    n: sorted.length,
    scoredAttempts: scoredAttempts ?? sorted.length,
  };
}

/** One question, one repetition. */
export interface Attempt {
  readonly question: EvalQuestion;
  readonly retrieved: readonly Evidence[];
  readonly record: GenerationRecord;
}

export interface GroundingMetrics {
  /** Fraction of citations resolving to evidence the request actually carried. */
  readonly citationPrecision: Dispersion;
  /** Fraction of factual sentences carrying a citation. */
  readonly citationCompleteness: Dispersion;
  /** Fraction of answerable questions answered rather than declined. */
  readonly answerRate: Dispersion;
  /** Accuracy of the incomplete decision against the `expectInsufficient` labels. */
  readonly insufficientAccuracy: Dispersion;
  /**
   * Time to the first visible token, in milliseconds.
   *
   * `n` here is attempts that emitted one, not attempts made. A response cut
   * off inside its reasoning never emits a visible token, so it contributes
   * nothing rather than contributing a zero — measured: two of five in a pilot
   * at a low `max_tokens`.
   */
  readonly firstTokenMs: Dispersion;
  /**
   * Attempts whose `stop_reason` was not `end_turn`.
   *
   * Kept out of the metrics above rather than pooled with them: PROTOCOL
   * requires a truncated or refused response to be recorded as itself, because
   * its numbers are not comparable to a complete response's.
   */
  readonly incomparable: readonly { readonly questionId: string; readonly stopReason: string | null }[];
}

/**
 * One repetition's rate: the mean of the per-question scores within it.
 *
 * Dispersion is then across repetitions rather than across questions, which is
 * the shape PROTOCOL asks for — the question is how much a rate moves when the
 * same run is repeated, not how much it varies between easy and hard questions.
 *
 * Returns `null` when nothing in the repetition was scoreable, so an empty
 * repetition is excluded rather than counted as zero.
 */
function repetitionRate(
  attempts: readonly Attempt[],
  score: (a: Attempt) => number | null,
): { rate: number; scored: number } | null {
  const values = attempts.map(score).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return {
    rate: values.reduce((sum, value) => sum + value, 0) / values.length,
    scored: values.length,
  };
}

export function groundingMetrics(
  repetitions: readonly (readonly Attempt[])[],
): GroundingMetrics {
  const rate = (score: (a: Attempt) => number | null) => {
    const perRepetition = repetitions
      .map((attempts) => repetitionRate(attempts, score))
      .filter((value): value is { rate: number; scored: number } => value !== null);

    return dispersion(
      perRepetition.map((entry) => entry.rate),
      perRepetition.reduce((sum, entry) => sum + entry.scored, 0),
    );
  };

  const comparable = (attempt: Attempt) => attempt.record.stopReason === 'end_turn';

  return {
    citationPrecision: rate((attempt) => {
      if (!comparable(attempt)) return null;
      const answer = attempt.record.answer;
      if (answer.incomplete) return null;
      const total = answer.citations.length + answer.rejected.length;
      return total === 0 ? null : answer.citations.length / total;
    }),

    citationCompleteness: rate((attempt) => {
      if (!comparable(attempt)) return null;
      const answer = attempt.record.answer;
      if (answer.incomplete) return null;
      const sentences = answer.markdown.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      if (sentences.length === 0) return null;
      return (sentences.length - answer.uncitedSentences.length) / sentences.length;
    }),

    answerRate: rate((attempt) => {
      if (!comparable(attempt) || attempt.question.expectInsufficient) return null;
      return attempt.record.answer.incomplete ? 0 : 1;
    }),

    insufficientAccuracy: rate((attempt) => {
      if (!comparable(attempt)) return null;
      return attempt.record.answer.incomplete === attempt.question.expectInsufficient ? 1 : 0;
    }),

    firstTokenMs: dispersion(
      repetitions.flat().flatMap((attempt) =>
        attempt.record.firstTokenMs === null ? [] : [attempt.record.firstTokenMs],
      ),
    ),

    incomparable: repetitions
      .flat()
      .filter((attempt) => !comparable(attempt))
      .map((attempt) => ({
        questionId: attempt.question.id,
        stopReason: attempt.record.stopReason,
      })),
  };
}
