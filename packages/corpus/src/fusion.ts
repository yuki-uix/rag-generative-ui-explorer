import type { Candidate, Retriever } from './retriever.js';

/**
 * Reciprocal-rank fusion.
 *
 * `score = sum over arms of 1 / (RRF_K + rank)`, rank starting at 1.
 *
 * Ranks rather than scores, because the two arms produce numbers on different
 * and unrelated scales — a BM25 score of 11 and a cosine of 0.6 cannot be added
 * or normalised into comparability without inventing a mapping nobody can
 * defend. Rank is the only thing they share.
 */
export const RRF_K = 60;

/**
 * How many candidates each arm contributes before fusion.
 *
 * Larger than the k asked for on purpose: fusion can only reorder what it is
 * given, so an arm that found the answer at rank 30 contributes nothing if the
 * pool stops at 10. This is the parameter that decides what fusion is allowed
 * to rescue, and it is recorded with results rather than left implicit.
 */
export const FUSION_POOL = 50;

export interface FusionParameters {
  readonly rrfK: number;
  readonly pool: number;
  readonly arms: readonly string[];
}

export class FusionRetriever implements Retriever {
  constructor(
    private readonly arms: readonly { name: string; retriever: Retriever }[],
    private readonly rrfK: number = RRF_K,
    private readonly pool: number = FUSION_POOL,
  ) {}

  get parameters(): FusionParameters {
    return { rrfK: this.rrfK, pool: this.pool, arms: this.arms.map((arm) => arm.name) };
  }

  async search(query: string, k: number): Promise<Candidate[]> {
    if (k <= 0) return [];

    const perArm = await Promise.all(
      this.arms.map((arm) => arm.retriever.search(query, this.pool)),
    );

    const fused = new Map<string, number>();
    for (const candidates of perArm) {
      candidates.forEach((candidate, index) => {
        const contribution = 1 / (this.rrfK + index + 1);
        fused.set(candidate.evidenceId, (fused.get(candidate.evidenceId) ?? 0) + contribution);
      });
    }

    return [...fused]
      .map(([evidenceId, score]) => ({ evidenceId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
