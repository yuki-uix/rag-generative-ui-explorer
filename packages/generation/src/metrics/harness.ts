import type { Evidence } from '@rgux/contracts';
import type { EvalQuestion, EvalHeader, Retriever } from '@rgux/corpus';
import * as generation from '../generate.js';
import { PROMPT_VERSION } from '../prompt.js';
import type { ModelProfile } from '../profile.js';
import { groundingMetrics, type Attempt, type GroundingMetrics } from './grounding.js';
import { retrievalMetrics, type RetrievalMetrics } from './retrieval.js';

/**
 * Everything `eval/PROTOCOL.md` requires a run to pin and record. A comparison
 * whose arms disagree on any of it is not a comparison, so it is carried with
 * the numbers rather than remembered.
 */
export interface RunHeader {
  readonly profileId: string;
  readonly model: string;
  readonly endpoint: string;
  readonly promptVersion: string;
  readonly corpusVersion: string;
  readonly chunking: EvalHeader['chunking'];
  readonly questionSet: { readonly count: number; readonly labelledOn: string };
  readonly k: number;
  readonly repetitions: number;
  readonly maxTokens: number;
  readonly startedAt: string;
}

export interface MetricsReport {
  readonly header: RunHeader;
  readonly retrieval: RetrievalMetrics;
  /**
   * Absent when the run was retrieval-only.
   *
   * Retrieval metrics are mechanical while no model sits in the pipeline, so
   * they run free and in CI. Grounding metrics are model-dependent and cost
   * money, so a report that has one and not the other is the normal case, not a
   * broken one.
   */
  readonly grounding?: GroundingMetrics;
  readonly spend?: {
    readonly calls: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheCreationInputTokens: number;
    readonly cacheReadInputTokens: number;
    readonly responsesWithHiddenReasoning: number;
  };
}

export interface RunOptions {
  retriever: Retriever;
  evidenceById: ReadonlyMap<string, Evidence>;
  questions: readonly EvalQuestion[];
  header: Omit<RunHeader, 'startedAt'>;
  /** Zero means retrieval only: no model is called and nothing is spent. */
  repetitions: number;
  profile: ModelProfile;
  maxTokens: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Run the harness.
 *
 * Generation goes through `generation.generateAnswer` — the function the
 * application calls — reached through the module namespace so a test can prove
 * it. #16 requires this: a harness that rebuilt the request, or scored the
 * output with its own copy of the validator, would keep passing after the real
 * path broke while appearing to cover it.
 */
export async function runMetrics(options: RunOptions): Promise<MetricsReport> {
  const { retriever, evidenceById, questions, header, repetitions, profile, maxTokens } = options;

  const retrieval = await retrievalMetrics(retriever, questions, header.k);
  const startedAt = new Date().toISOString();
  const fullHeader: RunHeader = { ...header, promptVersion: PROMPT_VERSION, startedAt };

  if (repetitions === 0) {
    return { header: fullHeader, retrieval };
  }

  const rounds: Attempt[][] = [];
  const total = repetitions * questions.length;
  let done = 0;

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const attempts: Attempt[] = [];

    for (const question of questions) {
      const retrieved = (await retriever.search(question.question, header.k))
        .map((candidate) => evidenceById.get(candidate.evidenceId))
        .filter((item): item is Evidence => item !== undefined);

      const record = await generation.generateAnswer({
        profile,
        question: question.question,
        evidence: retrieved,
        maxTokens,
      });

      attempts.push({ question, retrieved, record });
      done += 1;
      options.onProgress?.(done, total);
    }

    rounds.push(attempts);
  }

  const all = rounds.flat();
  return {
    header: fullHeader,
    retrieval,
    grounding: groundingMetrics(rounds),
    spend: {
      calls: all.length,
      inputTokens: all.reduce((sum, a) => sum + a.record.usage.inputTokens, 0),
      outputTokens: all.reduce((sum, a) => sum + a.record.usage.outputTokens, 0),
      cacheCreationInputTokens: all.reduce((sum, a) => sum + a.record.usage.cacheCreationInputTokens, 0),
      cacheReadInputTokens: all.reduce((sum, a) => sum + a.record.usage.cacheReadInputTokens, 0),
      responsesWithHiddenReasoning: all.filter((a) => a.record.hadHiddenReasoning).length,
    },
  };
}
