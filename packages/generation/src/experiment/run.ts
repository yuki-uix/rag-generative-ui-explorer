import { z } from 'zod';
import { KnowledgeUIResponse, gate, type ValidationFailure } from '@rgux/contracts';
import type { Evidence } from '@rgux/contracts';
import type { EvalQuestion } from '@rgux/corpus';
import { planCards, type PlanOptions, type PlanRecord } from '../planner/plan.js';
import { resolveHandles } from '../planner/handles.js';
import { planWithLangChain } from './langchain.js';
import { fixtureCompletion, fixtureFetch, type Scenario } from './fixtures.js';
import type { ExperimentInputs } from './inputs.js';

/** F2 replaces the adapter, keeping retrieval and validation outside it. */
export interface ExperimentAdapter {
  readonly id: string;
  plan(options: PlanOptions): Promise<PlanRecord>;
}
export const nativeAdapter: ExperimentAdapter = { id: 'native', plan: planCards };
export const langchainAdapter: ExperimentAdapter = { id: 'langchain', plan: planWithLangChain };
export function adapterById(id: string): ExperimentAdapter {
  if (id === 'native') return nativeAdapter;
  if (id === 'langchain') return langchainAdapter;
  throw new Error(`Unsupported implementation: ${id}`);
}

export interface PreparedSample {
  question: EvalQuestion;
  evidence: Evidence[];
  retrievalMs: number;
}

/** One retrieval pass shared by both arms. Saved before any model is invoked. */
export async function prepareSamples(inputs: ExperimentInputs): Promise<PreparedSample[]> {
  const samples: PreparedSample[] = [];
  for (const question of inputs.questions) {
    const start = performance.now();
    const candidates = await inputs.retriever.search(question.question, inputs.config.k);
    const evidence = candidates.map((candidate) => {
      const item = inputs.evidenceById.get(candidate.evidenceId);
      if (!item) throw new Error(`Retriever returned unknown evidence: ${candidate.evidenceId}`);
      return { ...item, retrievalScore: candidate.score };
    });
    samples.push({ question, evidence, retrievalMs: performance.now() - start });
  }
  return samples;
}

export interface RequestRecord {
  url: string;
  method: string;
  body: unknown;
  status: number | null;
}

const PlannerEnvelope = z.discriminatedUnion('incomplete', [
  z.strictObject({ cards: z.array(z.unknown()).min(1).max(4), incomplete: z.literal(false) }),
  z.strictObject({ cards: z.array(z.unknown()).max(4), incomplete: z.literal(true), incompleteReason: z.enum(['missing', 'conflicting']) }),
]);

export type Outcome = 'valid' | 'incomplete' | 'invalid' | 'adapter-error' | 'budget-exceeded' | 'provider-error' | 'refused' | 'truncated' | 'stopped';
export interface ExperimentRecord {
  implementation: string;
  question: EvalQuestion;
  evidence: Evidence[];
  attempts: PlanRecord[];
  requests: RequestRecord[];
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
  options: {
    mode: 'smoke' | 'live'; scenario: Scenario; adapter?: ExperimentAdapter;
    samples?: readonly PreparedSample[];
    budget?: { used: number; limit: number };
  },
  onRecord?: (record: ExperimentRecord) => void,
): Promise<ExperimentRecord[]> {
  const adapter = options.adapter ?? adapterById(inputs.config.implementation);
  if (adapter.id !== inputs.config.implementation) throw new Error('Adapter and pinned implementation disagree.');
  if (options.mode === 'live' && options.scenario !== 'valid') throw new Error('Failure fixtures require smoke mode.');
  if (inputs.questions.length > inputs.config.maxModelCalls) throw new Error('Model call budget exceeded.');
  const budget = options.budget ?? { used: 0, limit: inputs.config.maxModelCalls };
  if (budget.used + inputs.questions.length > budget.limit) throw new Error('Model call budget exceeded.');
  const samples = options.samples ?? await prepareSamples(inputs);
  if (samples.length !== inputs.questions.length || samples.some((sample, index) =>
    sample.question.id !== inputs.questions[index]!.id || sample.question.question !== inputs.questions[index]!.question)) {
    throw new Error('Prepared samples and pinned questions disagree.');
  }
  const records: ExperimentRecord[] = [];
  for (const sample of samples) {
    const { question, evidence } = sample;
    const start = performance.now();
    const record: ExperimentRecord = {
      implementation: adapter.id, question, evidence, attempts: [], requests: [], raw: null,
      validation: { originalValid: false, finalValid: false, repairAttempted: false, failures: [] },
      result: null, outcome: 'provider-error', error: null,
      timingMs: { retrieval: sample.retrievalMs, generation: 0, validation: 0, total: 0 },
    };
    const transport = options.mode === 'smoke'
      ? fixtureFetch(fixtureCompletion(question, evidence, options.scenario), options.scenario)
      : globalThis.fetch;
    let budgetExceeded = false;
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (budget.used >= budget.limit) {
        budgetExceeded = true;
        throw Object.assign(new Error('Model call budget exhausted at transport boundary.'), { name: 'BudgetExceededError' });
      }
      budget.used++;
      const endpoint = new URL(url instanceof Request ? url.url : String(url));
      // Deliberately omit headers, URL credentials/query, and provider error messages.
      endpoint.username = ''; endpoint.password = ''; endpoint.search = ''; endpoint.hash = '';
      const body = typeof init?.body === 'string' ? init.body : url instanceof Request ? await url.clone().text() : null;
      const request: RequestRecord = {
        url: endpoint.toString(), method: init?.method ?? (url instanceof Request ? url.method : 'POST'),
        body: body === null ? null : JSON.parse(body), status: null,
      };
      record.requests.push(request);
      const response = await transport(url, init);
      request.status = response.status;
      return response;
    };
    try {
      const plan = await adapter.plan({
        profile: inputs.profile, question: question.question, evidence, schema: inputs.schema,
        maxTokens: inputs.config.maxTokens, maxRetries: inputs.config.sdkMaxRetries, timeoutMs: inputs.config.timeoutMs,
        onDelta: (text) => { record.raw = (record.raw ?? '') + text; },
        fetch,
        ...(options.mode === 'smoke' ? {
          apiKey: 'offline-fixture-key',
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
      record.outcome = budgetExceeded ? 'budget-exceeded'
        : record.requests.length > 0 || record.error.status !== null ? 'provider-error' : 'adapter-error';
    }
    record.timingMs.total = performance.now() - start + record.timingMs.retrieval;
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
  const validated = gate(plan.cards, record.evidence);
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
