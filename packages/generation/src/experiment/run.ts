import { z } from 'zod';
import { KnowledgeUIResponse } from '@rgux/contracts';
import type { Evidence } from '@rgux/contracts';
import type { EvalQuestion } from '@rgux/corpus';
import { planCards, type PlanOptions, type PlanRecord } from '../planner/plan.js';
import { resolveHandles } from '../planner/handles.js';
import { validateCards, type ValidationFailure } from '../planner/validate.js';
import { fixtureCompletion, fixtureFetch, type Scenario } from './fixtures.js';
import type { ExperimentInputs } from './inputs.js';

/** F2 replaces the adapter, keeping retrieval and validation outside it. */
export interface ExperimentAdapter {
  readonly id: string;
  plan(options: PlanOptions): Promise<PlanRecord>;
}
export const nativeAdapter: ExperimentAdapter = { id: 'native', plan: planCards };

const PlannerEnvelope = z.discriminatedUnion('incomplete', [
  z.strictObject({ cards: z.array(z.unknown()).min(1).max(4), incomplete: z.literal(false) }),
  z.strictObject({ cards: z.array(z.unknown()).max(4), incomplete: z.literal(true), incompleteReason: z.enum(['missing', 'conflicting']) }),
]);

export type Outcome = 'valid' | 'incomplete' | 'invalid' | 'provider-error' | 'refused' | 'truncated' | 'stopped';
export interface ExperimentRecord {
  question: EvalQuestion;
  evidence: Evidence[];
  attempts: PlanRecord[];
  raw: string | null;
  validation: {
    originalValid: boolean;
    finalValid: boolean;
    repairAttempted: false;
    failures: ValidationFailure[];
  };
  result: KnowledgeUIResponse | null;
  outcome: Outcome;
  error: { name: string; status: number | null } | null;
  timingMs: { retrieval: number; generation: number; validation: number; total: number };
}

export async function runExperiment(
  inputs: ExperimentInputs,
  options: { mode: 'smoke' | 'live'; scenario: Scenario; adapter?: ExperimentAdapter },
  onRecord?: (record: ExperimentRecord) => void,
): Promise<ExperimentRecord[]> {
  const adapter = options.adapter ?? nativeAdapter;
  if (adapter.id !== inputs.config.implementation) throw new Error('Adapter and pinned implementation disagree.');
  if (options.mode === 'live' && options.scenario !== 'valid') throw new Error('Failure fixtures require smoke mode.');
  if (inputs.questions.length > inputs.config.maxModelCalls) throw new Error('Model call budget exceeded.');
  const records: ExperimentRecord[] = [];
  for (const question of inputs.questions) {
    const start = performance.now();
    const candidates = await inputs.retriever.search(question.question, inputs.config.k);
    const evidence = candidates.map((candidate) => {
      const item = inputs.evidenceById.get(candidate.evidenceId);
      if (!item) throw new Error(`Retriever returned unknown evidence: ${candidate.evidenceId}`);
      return { ...item, retrievalScore: candidate.score };
    });
    const generationStart = performance.now();
    const record: ExperimentRecord = {
      question, evidence, attempts: [], raw: null,
      validation: { originalValid: false, finalValid: false, repairAttempted: false, failures: [] },
      result: null, outcome: 'provider-error', error: null,
      timingMs: { retrieval: generationStart - start, generation: 0, validation: 0, total: 0 },
    };
    try {
      const plan = await adapter.plan({
        profile: inputs.profile, question: question.question, evidence, schema: inputs.schema,
        maxTokens: inputs.config.maxTokens, maxRetries: inputs.config.sdkMaxRetries, timeoutMs: inputs.config.timeoutMs,
        onDelta: (text) => { record.raw = (record.raw ?? '') + text; },
        ...(options.mode === 'smoke' ? {
          apiKey: 'offline-fixture-key',
          fetch: fixtureFetch(fixtureCompletion(question, evidence, options.scenario), options.scenario),
        } : {}),
      });
      record.attempts.push(plan);
      record.raw = plan.raw;
      if (plan.stopReason !== 'end_turn') {
        record.outcome = plan.stopReason === 'max_tokens' ? 'truncated'
          : plan.stopReason === 'refusal' ? 'refused' : 'stopped';
      } else {
        const validationStart = performance.now();
        validatePlan(record, inputs);
        record.timingMs.validation = performance.now() - validationStart;
      }
    } catch (error) {
      // Provider messages can echo credentials or headers. Keep a stable type and HTTP
      // status, never serialise the Error or the SDK request object into an artifact.
      record.error = {
        name: error instanceof Error ? error.name : 'UnknownError',
        status: error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : null,
      };
      record.outcome = 'provider-error';
    }
    record.timingMs.total = performance.now() - start;
    record.timingMs.generation = record.timingMs.total - record.timingMs.retrieval - record.timingMs.validation;
    records.push(record);
    // Persist after every question so a later failure cannot erase finished work.
    onRecord?.(record);
  }
  return records;
}

function validatePlan(record: ExperimentRecord, inputs: ExperimentInputs): void {
  const fail = (stage: ValidationFailure['stage'], message: string) => {
    record.validation.failures.push({ stage, cardIndex: -1, message });
    record.outcome = 'invalid';
  };
  let parsed: unknown;
  try { parsed = JSON.parse(record.raw!); }
  catch { fail('schema', 'Model output is not JSON.'); return; }
  const envelope = PlannerEnvelope.safeParse(parsed);
  if (!envelope.success) { fail('schema', envelope.error.message); return; }
  const resolved = resolveHandles(envelope.data, record.evidence);
  if (resolved.invented.length) {
    fail('evidence-reference', `Unknown evidence handles: ${resolved.invented.join(', ')}`);
    return;
  }
  const plan = resolved.plan as typeof envelope.data;
  const validated = validateCards(plan.cards, record.evidence);
  if (validated.failures.length) {
    record.validation.failures.push(...validated.failures);
    record.outcome = 'invalid';
    return;
  }
  const result = KnowledgeUIResponse.safeParse({
    query: record.question.question, cards: validated.cards, evidence: record.evidence, suggestedActions: [],
    metadata: {
      knowledgeBaseVersion: inputs.pins.corpus.version, generatedAt: new Date().toISOString(),
      incomplete: plan.incomplete,
      ...(plan.incomplete ? { incompleteReason: plan.incompleteReason } : {}),
    },
  });
  if (!result.success) { fail('schema', result.error.message); return; }
  record.result = result.data;
  record.validation.originalValid = true;
  record.validation.finalValid = true;
  record.outcome = plan.incomplete ? 'incomplete' : 'valid';
}
