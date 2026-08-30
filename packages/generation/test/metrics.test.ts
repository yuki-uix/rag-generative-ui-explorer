/**
 * The harness's own properties. Retrieval metrics are checked against a
 * hand-computed case; the constraint in #16 — that the harness calls the real
 * generation entry point rather than a copy of it — is checked by spying on
 * that function and asserting the harness went through it.
 */
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '@rgux/contracts';
import { BM25Retriever, ingest, parseEvalSet, type EvalQuestion, type Retriever } from '@rgux/corpus';
import { readFileSync } from 'node:fs';
import * as generation from '../src/generate.js';
import { DEEPSEEK, dispersion, retrievalMetrics, runMetrics } from '../src/index.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const { evidence } = ingest(resolve(repoRoot, 'knowledge'));
const evidenceById = new Map(evidence.map((item) => [item.id, item]));
const { set, problems } = parseEvalSet(readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'));

describe('retrieval metrics', () => {
  /**
   * A retriever with a known ranking, so the arithmetic is checkable by hand
   * rather than by running the thing under test twice.
   *
   * Golden = {A, B}. Returned = [X, A, Y, B]. Recall@4 = 2/2 = 1.
   * First hit at rank 2, so RR = 1/2.
   * DCG = 1/log2(3) + 1/log2(5) = 0.6309 + 0.4307 = 1.0616.
   * Ideal (both golden first) = 1/log2(2) + 1/log2(3) = 1 + 0.6309 = 1.6309.
   * nDCG = 0.6509.
   */
  const fixed: Retriever = {
    search: () => [
      { evidenceId: 'X', score: 4 },
      { evidenceId: 'A', score: 3 },
      { evidenceId: 'Y', score: 2 },
      { evidenceId: 'B', score: 1 },
    ],
  };

  const question = {
    id: 'q1',
    question: 'anything',
    domain: 'rag',
    expectedCardTypes: ['definition'],
    goldenEvidenceIds: ['A', 'B'],
    expectInsufficient: false,
  } as unknown as EvalQuestion;

  it('computes recall, MRR, and nDCG to a hand-worked example', () => {
    const metrics = retrievalMetrics(fixed, [question], 4);

    expect(metrics.meanRecall).toBe(1);
    expect(metrics.anyHitRate).toBe(1);
    expect(metrics.mrr).toBeCloseTo(0.5, 6);
    expect(metrics.ndcg).toBeCloseTo(0.6509, 3);
    expect(metrics.zeroHitQuestionIds).toEqual([]);
  });

  it('names the questions that found nothing rather than only counting them', () => {
    const missing = { ...question, id: 'q2', goldenEvidenceIds: ['Z'] } as unknown as EvalQuestion;
    const metrics = retrievalMetrics(fixed, [missing], 4);

    expect(metrics.zeroHitQuestionIds).toEqual(['q2']);
    expect(metrics.mrr).toBe(0);
  });

  // An unanswerable question has no passage to find, so scoring it would drag
  // recall down for behaving correctly.
  it('excludes questions that have no golden evidence', () => {
    const insufficient = {
      ...question,
      id: 'ins',
      goldenEvidenceIds: [],
      expectInsufficient: true,
    } as unknown as EvalQuestion;

    expect(retrievalMetrics(fixed, [question, insufficient], 4).questions).toBe(1);
  });

  it('scores the real corpus and eval set without error', () => {
    expect(problems).toEqual([]);
    const metrics = retrievalMetrics(new BM25Retriever(evidence), set!.questions, 10);

    expect(metrics.questions).toBeGreaterThan(0);
    expect(metrics.meanRecall).toBeGreaterThan(0);
    expect(metrics.meanRecall).toBeLessThanOrEqual(1);
  });
});

describe('dispersion', () => {
  it('reports the median and the full range, never a bare mean', () => {
    expect(dispersion([0.2, 0.9, 0.5])).toEqual({
      median: 0.5, min: 0.2, max: 0.9, n: 3, scoredAttempts: 3,
    });
  });

  it('takes the midpoint of an even sample', () => {
    expect(dispersion([1, 2, 3, 4]).median).toBe(2.5);
  });
});

describe('the harness', () => {
  const oneQuestion = set!.questions.slice(0, 1);
  const retriever = new BM25Retriever(evidence);

  const header = {
    profileId: DEEPSEEK.id,
    model: DEEPSEEK.model,
    endpoint: DEEPSEEK.baseURL ?? 'anthropic',
    promptVersion: 'ignored',
    corpusVersion: set!.header.corpusVersion,
    chunking: set!.header.chunking,
    questionSet: { count: set!.questions.length, labelledOn: set!.header.labelledOn },
    k: 10,
    repetitions: 1,
    maxTokens: 256,
  };

  it('calls no model, and spends nothing, when repetitions is zero', async () => {
    const spy = vi.spyOn(generation, 'generateAnswer');

    const report = await runMetrics({
      retriever,
      evidenceById,
      questions: oneQuestion,
      header: { ...header, repetitions: 0 },
      repetitions: 0,
      profile: DEEPSEEK,
      maxTokens: 256,
    });

    expect(spy).not.toHaveBeenCalled();
    expect(report.grounding).toBeUndefined();
    expect(report.spend).toBeUndefined();
    expect(report.retrieval.questions).toBe(1);
    spy.mockRestore();
  });

  /**
   * The constraint #16 exists for. A harness that built its own request, or
   * scored the output with its own copy of the validator, would keep passing
   * after the real path broke while appearing to cover it.
   */
  it('generates through the application entry point, not a copy of it', async () => {
    const spy = vi.spyOn(generation, 'generateAnswer').mockResolvedValue({
      profileId: DEEPSEEK.id,
      model: DEEPSEEK.model,
      promptVersion: 'test',
      maxTokens: 256,
      raw: 'A claim. [E1]',
      answer: { incomplete: false, markdown: 'A claim. [E1]', citations: [{ handle: 'E1', evidenceId: 'x' }], rejected: [], uncitedSentences: [] },
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      firstTokenMs: 100,
      hadHiddenReasoning: false,
      latencyMs: 200,
    } satisfies generation.GenerationRecord);

    const report = await runMetrics({
      retriever,
      evidenceById,
      questions: oneQuestion,
      header,
      repetitions: 1,
      profile: DEEPSEEK,
      maxTokens: 256,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    // The evidence handed to it came from the retriever, not from the test.
    const call = spy.mock.calls[0]![0];
    expect(call.profile).toBe(DEEPSEEK);
    expect(call.question).toBe(oneQuestion[0]!.question);
    expect(call.evidence.length).toBeGreaterThan(0);

    expect(report.spend?.calls).toBe(1);
    expect(report.grounding?.citationPrecision.n).toBe(1);
    spy.mockRestore();
  });

  /**
   * A rate over two comparable answers must not print like a rate over sixty.
   * `n` counts repetitions and says nothing about how much evidence fed them,
   * which is how a pilot reported 100% accuracy from two attempts.
   */
  it('reports how many attempts fed a rate, not only how many repetitions', () => {
    const scored = dispersion([1, 1], 2);
    expect(scored.n).toBe(2);
    expect(scored.scoredAttempts).toBe(2);

    const thin = dispersion([1], 2);
    expect(thin.n).toBe(1);
    expect(thin.scoredAttempts).toBe(2);
  });

  it('keeps a truncated response out of the metrics rather than pooling it', async () => {
    const spy = vi.spyOn(generation, 'generateAnswer').mockResolvedValue({
      profileId: DEEPSEEK.id, model: DEEPSEEK.model, promptVersion: 'test', maxTokens: 256,
      raw: 'Cut off mid-',
      answer: { incomplete: false, markdown: 'Cut off mid-', citations: [], rejected: [], uncitedSentences: [] },
      stopReason: 'max_tokens',
      usage: { inputTokens: 10, outputTokens: 256, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      firstTokenMs: 50, hadHiddenReasoning: false, latencyMs: 100,
    } satisfies generation.GenerationRecord);

    const report = await runMetrics({
      retriever, evidenceById, questions: oneQuestion, header,
      repetitions: 1, profile: DEEPSEEK, maxTokens: 256,
    });

    expect(report.grounding?.incomparable).toEqual([
      { questionId: oneQuestion[0]!.id, stopReason: 'max_tokens' },
    ]);
    expect(report.grounding?.citationPrecision.n).toBe(0);
    spy.mockRestore();
  });
});
