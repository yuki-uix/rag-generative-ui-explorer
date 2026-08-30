import type { EvalQuestion } from '@rgux/corpus';
import type { Retriever } from '@rgux/corpus';

/**
 * Retrieval metrics.
 *
 * `eval/PROTOCOL.md` classifies these as **mechanical while the pipeline has no
 * model in it**: lexical retrieval is deterministic given a fixed corpus,
 * index, and query, so one run is a measurement and not a sample. That is why
 * this half runs in CI and the grounding half does not.
 *
 * The classification expires the moment query rewriting or reranking lands
 * (#13, #14): both put a model in front of the numbers, and then these need
 * repetitions like anything else. The report says which it is rather than
 * leaving a reader to remember.
 */
export interface RetrievalMetrics {
  readonly k: number;
  readonly questions: number;
  /** Mean fraction of a question's golden evidence appearing in the top K. */
  readonly meanRecall: number;
  /** Fraction of questions with at least one golden hit in the top K. */
  readonly anyHitRate: number;
  /** Mean reciprocal rank of the first golden hit; 0 for a question with none. */
  readonly mrr: number;
  /** nDCG@K with binary relevance. */
  readonly ndcg: number;
  /** Questions whose golden evidence never appeared. Named, not just counted. */
  readonly zeroHitQuestionIds: readonly string[];
}

function dcg(hits: readonly boolean[]): number {
  return hits.reduce((sum, hit, index) => (hit ? sum + 1 / Math.log2(index + 2) : sum), 0);
}

/**
 * Score a retriever against the labelled questions.
 *
 * Only questions with golden evidence are scored. A question labelled
 * `expectInsufficient` has no correct passage to find, so including it would
 * drag recall toward zero for behaving correctly.
 */
export function retrievalMetrics(
  retriever: Retriever,
  questions: readonly EvalQuestion[],
  k: number,
): RetrievalMetrics {
  const answerable = questions.filter((question) => question.goldenEvidenceIds.length > 0);

  let recallSum = 0;
  let anyHit = 0;
  let reciprocalRankSum = 0;
  let ndcgSum = 0;
  const zeroHitQuestionIds: string[] = [];

  for (const question of answerable) {
    const golden = new Set(question.goldenEvidenceIds);
    const ranked = retriever.search(question.question, k);
    const hits = ranked.map((candidate) => golden.has(candidate.evidenceId));

    const found = hits.filter(Boolean).length;
    recallSum += found / golden.size;

    const firstHit = hits.indexOf(true);
    if (firstHit >= 0) {
      anyHit += 1;
      reciprocalRankSum += 1 / (firstHit + 1);
    } else {
      zeroHitQuestionIds.push(question.id);
    }

    // Ideal ranking puts every findable golden passage first. Capped at k
    // because a question with more golden passages than k cannot fill them all,
    // and dividing by an unreachable ideal would report a shortfall the
    // retriever cannot fix.
    const ideal = dcg(Array.from({ length: Math.min(golden.size, k) }, () => true));
    ndcgSum += ideal > 0 ? dcg(hits) / ideal : 0;
  }

  const n = answerable.length;
  return {
    k,
    questions: n,
    meanRecall: n > 0 ? recallSum / n : 0,
    anyHitRate: n > 0 ? anyHit / n : 0,
    mrr: n > 0 ? reciprocalRankSum / n : 0,
    ndcg: n > 0 ? ndcgSum / n : 0,
    zeroHitQuestionIds,
  };
}
