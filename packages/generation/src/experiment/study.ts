import { z } from 'zod';
import { PLANNER_PROMPT_VERSION, plannerSystemPrompt, plannerUserPrompt, schemaBelongsInPrompt } from '../planner/prompt.js';
import type { PlanRecord } from '../planner/plan.js';
import { ExperimentConfig, type ExperimentInputs } from './inputs.js';
import { prepareSamples, runExperiment, type ExperimentRecord, type PreparedSample } from './run.js';
import { runGraphExperiment, type GraphRun } from './graph.js';
import { compareRecords, requestText } from './compare.js';
import { selectContext } from './context.js';

export const ARMS = ['native', 'langchain', 'langgraph'] as const;
export type StudyArm = (typeof ARMS)[number];
export const StudyConfig = z.strictObject({
  version: z.literal('framework-study-1'),
  purpose: z.enum(['pilot', 'evaluation']),
  repetitions: z.union([z.literal(1), z.literal(3)]),
  questionSetIsBlind: z.literal(false),
  expected: z.strictObject({
    questionSetSha256: z.string().regex(/^[a-f0-9]{64}$/),
    schemaSha256: z.string().regex(/^[a-f0-9]{64}$/),
    corpusVersion: z.string().min(1),
    promptVersion: z.string().min(1),
  }),
  experiment: ExperimentConfig,
}).superRefine((config, ctx) => {
  if (config.purpose === 'evaluation' && config.repetitions !== 3) ctx.addIssue({ code: 'custom', message: 'Evaluation requires three repetitions.' });
  const experiment = config.experiment;
  if (experiment.implementation !== 'langgraph' || experiment.graph?.version !== 'bounded-retrieval-2' || experiment.graph.maxEvidence !== experiment.k) {
    ctx.addIssue({ code: 'custom', message: 'Study requires graph v2 and a shared final evidence cap equal to k.' });
  }
  if (experiment.graph?.maxModelCallsPerQuestion !== 4) ctx.addIssue({ code: 'custom', message: 'Study reserves four graph calls per question.' });
  if (experiment.maxModelCalls < config.repetitions * experiment.questionIds.length * 6) {
    ctx.addIssue({ code: 'custom', message: 'Study budget must reserve the worst case for all arms and repetitions.' });
  }
});
export type StudyConfig = z.infer<typeof StudyConfig>;
export interface StudyRecord {
  arm: StudyArm;
  repetition: number;
  order: StudyArm[];
  executionMs: number;
  observed: ExperimentRecord | GraphRun;
}

export function validateStudy(config: StudyConfig, inputs: ExperimentInputs): void {
  StudyConfig.parse(config);
  if (JSON.stringify(config.experiment) !== JSON.stringify(inputs.config)) throw new Error('Loaded experiment and study config disagree.');
  const actual = {
    questionSetSha256: inputs.pins.questionSet.sha256, schemaSha256: inputs.pins.schemaSha256,
    corpusVersion: inputs.pins.corpus.version, promptVersion: inputs.pins.promptVersion,
  };
  if (JSON.stringify(config.expected) !== JSON.stringify(actual)) throw new Error('Frozen study pins changed; start a new baseline.');
  if (config.purpose === 'evaluation' && (inputs.questions.length < 60 || inputs.questions.length !== inputs.pins.questionSet.header.questionCount)) {
    throw new Error('Evaluation must use the complete question set, with at least 60 questions.');
  }
}

/** One run holds all shared pins by construction; F2 pairs also verify the
 * actual wire payload. Arms rotate by question and repetition to limit order bias. */
export async function runStudy(
  config: StudyConfig, inputs: ExperimentInputs,
  options: { mode: 'smoke' | 'live'; scenario: 'demo' | 'invalid-reference' },
  onRecord?: (record: StudyRecord) => void,
  onPrepared?: (samples: readonly PreparedSample[]) => void,
) {
  validateStudy(config, inputs);
  if (options.mode === 'live' && options.scenario !== 'demo') throw new Error('Fixtures require smoke mode.');
  if (options.mode === 'live' && !process.env[inputs.profile.apiKeyEnv]) throw new Error(`${inputs.profile.apiKeyEnv} is not set.`);
  const policy = inputs.config.graph!;
  const samples = (await prepareSamples(inputs)).map((sample) => ({
    ...sample, evidence: selectContext(sample.question.question, [], sample.evidence, policy),
  }));
  onPrepared?.(samples);
  const records: StudyRecord[] = [];
  const budget = { used: 0, limit: inputs.config.maxModelCalls };
  for (let repetition = 1; repetition <= config.repetitions; repetition++) {
    for (const [index, sample] of samples.entries()) {
      const rotation = (index + repetition - 1) % ARMS.length;
      const order = [...ARMS.slice(rotation), ...ARMS.slice(0, rotation)];
      for (const arm of order) {
        const start = performance.now();
        let measuredSample = sample;
        if (arm !== 'langgraph') {
          const [fresh] = await prepareSamples({ ...inputs, questions: [sample.question] });
          measuredSample = { ...fresh!, evidence: selectContext(sample.question.question, [], fresh!.evidence, policy) };
          if (JSON.stringify(measuredSample.evidence) !== JSON.stringify(sample.evidence)) throw new Error('Measured retrieval differs from the frozen snapshot.');
        }
        const observed = arm === 'langgraph'
          ? await runGraphExperiment(inputs, sample.question, {
              ...options, budget,
              // Unlike the F3 demo, study smoke does NOT omit initial candidates.
              ...(options.mode === 'smoke' ? { retriever: inputs.retriever } : {}),
            })
          : (await runExperiment({ ...inputs, config: { ...inputs.config, implementation: arm }, questions: [sample.question] }, {
              mode: options.mode, scenario: options.scenario === 'demo' ? 'valid' : 'invalid-reference',
              samples: [measuredSample], budget,
            }))[0]!;
        const record: StudyRecord = { arm, repetition, order, executionMs: performance.now() - start, observed };
        records.push(record);
        onRecord?.(record);
      }
    }
  }
  return { records, budget, samples };
}

export function dispersion(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return {
    n: sorted.length, median: sorted.length % 2 ? sorted[center]! : (sorted[center - 1]! + sorted[center]!) / 2,
    min: sorted[0]!, max: sorted.at(-1)!,
  };
}
const rate = (values: readonly boolean[]) => values.length ? values.filter(Boolean).length / values.length : null;
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const recall = (ids: readonly string[], golden: readonly string[]) => golden.length
  ? golden.filter((id) => new Set(ids).has(id)).length / golden.length : null;
const isGraph = (record: ExperimentRecord | GraphRun): record is GraphRun => 'calls' in record;
const generator = (record: StudyRecord) => isGraph(record.observed) ? record.observed.generation : record.observed;
const plans = (record: StudyRecord): (PlanRecord | null)[] => isGraph(record.observed)
  ? record.observed.calls.filter((call) => call.requests.length).map((call) => call.plan)
  : record.observed.requests.length ? [record.observed.attempts[0] ?? null] : [];
export function usageTotals(records: readonly StudyRecord[]) {
  const calls = records.flatMap(plans);
  return Object.fromEntries((['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'] as const).map((key) => [
    key, calls.every((call) => call?.usage[key] !== null && call?.usage[key] !== undefined)
      ? calls.reduce((sum, call) => sum + call!.usage[key]!, 0) : null,
  ]));
}

export function summarizeStudy(config: StudyConfig, inputs: ExperimentInputs, records: readonly StudyRecord[], mode: 'smoke' | 'live') {
  validateStudy(config, inputs);
  const expectedRows = config.repetitions * inputs.questions.length * ARMS.length;
  const rowKeys = new Set(records.map((record) => `${record.repetition}/${record.observed.question.id}/${record.arm}`));
  if (records.length !== expectedRows || rowKeys.size !== expectedRows) throw new Error('Missing or duplicate study records.');
  const policy = inputs.config.graph!;
  for (const record of records) {
    const question = inputs.questions.find((item) => item.id === record.observed.question.id);
    if (!question || JSON.stringify(question) !== JSON.stringify(record.observed.question) || !ARMS.includes(record.arm)
      || record.observed.implementation !== record.arm || record.repetition < 1 || record.repetition > config.repetitions || !Number.isInteger(record.repetition)) {
      throw new Error('Study record and frozen inputs disagree.');
    }
    if (record.observed.evidence.length > policy.maxEvidence
      || plannerUserPrompt(question.question, record.observed.evidence).length > policy.maxContextChars) throw new Error('Final context cap differs across arms.');
    if (isGraph(record.observed) && record.observed.modelCalls !== record.observed.calls.reduce((sum, call) => sum + call.requests.length, 0)) {
      throw new Error('Graph call accounting differs from actual requests.');
    }
    // Final generation calls must share model, endpoint, output cap and prompt version.
    const generation = generator(record);
    const request = generation?.requests[0];
    const body = request?.body as Record<string, unknown> | undefined;
    if (body) {
      const endpoint = new URL(inputs.profile.baseURL ?? 'https://api.anthropic.com');
      const actual = new URL(request!.url);
      const extras = inputs.pins.model.requestExtras;
      const effort = (body['output_config'] as Record<string, unknown> | undefined)?.['effort'];
      const expectedEffort = (extras['output_config'] as Record<string, unknown> | undefined)?.['effort'];
      if (body['model'] !== inputs.profile.model || body['max_tokens'] !== inputs.config.maxTokens || body['stream'] !== true
        || actual.origin !== endpoint.origin || !actual.pathname.startsWith(endpoint.pathname.replace(/\/$/, '') + '/')
        || JSON.stringify(body['thinking']) !== JSON.stringify(extras['thinking']) || effort !== expectedEffort
        || ['temperature', 'top_p', 'top_k'].some((key) => body[key] !== undefined)) throw new Error('Pinned generation settings changed.');
      const expectedSystem = plannerSystemPrompt(schemaBelongsInPrompt(inputs.profile) ? inputs.schema : undefined);
      const messages = body['messages'] as { role: string; content: unknown }[];
      if (requestText(body['system']) !== expectedSystem || messages.length !== 1 || messages[0]!.role !== 'user'
        || requestText(messages[0]!.content) !== plannerUserPrompt(question.question, generation!.evidence)) throw new Error('Pinned generation prompt changed.');
    }
    if (generation?.attempts.some((plan) => plan.promptVersion !== PLANNER_PROMPT_VERSION)) throw new Error('Pinned planner prompt changed.');
  }
  const paired = [];
  for (let repetition = 1; repetition <= config.repetitions; repetition++) {
    const single = records.filter((record) => record.repetition === repetition && record.arm !== 'langgraph').map((record) => record.observed as ExperimentRecord);
    paired.push({ repetition, pairs: compareRecords(single) });
  }
  const arms = ARMS.map((arm) => {
    const selected = records.filter((record) => record.arm === arm);
    const repetitions = Array.from({ length: config.repetitions }, (_, index) => {
      const rows = selected.filter((record) => record.repetition === index + 1);
      const finalRecall = rows.map((record) => recall(record.observed.evidence.map((item) => item.id), record.observed.question.goldenEvidenceIds)).filter((value) => value !== null);
      const generated = rows.map(generator).filter((record) => record && record.requests.length) as ExperimentRecord[];
      const completed = generated.filter((record) => record.attempts[0]?.stopReason === 'end_turn');
      return {
        repetition: index + 1, n: rows.length,
        usableResultRate: rate(rows.map((record) => record.observed.result !== null)),
        firstAttemptCardValidity: rate(completed.map((record) => record.validation.originalValid)),
        generatedN: generated.length, completedGenerationN: completed.length,
        evidenceReferenceFailureN: completed.filter((record) => record.validation.failures.some((failure) => failure.stage === 'evidence-reference')).length,
        executionMs: dispersion(rows.map((record) => record.executionMs)), usage: usageTotals(rows),
        missingEvidenceAccuracy: rate(rows.map((record) => record.observed.result !== null &&
          (record.observed.result.metadata.incomplete && record.observed.result.metadata.incompleteReason === 'missing') === record.observed.question.expectInsufficient)),
        finalContextRecallAtK: mean(finalRecall), recallN: finalRecall.length,
      };
    });
    const metrics = ['usableResultRate', 'firstAttemptCardValidity', 'missingEvidenceAccuracy', 'finalContextRecallAtK'] as const;
    return {
      arm, n: selected.length, repetitions,
      dispersion: Object.fromEntries(metrics.map((key) => [key, dispersion(repetitions.map((r) => r[key]).filter((v) => v !== null))])),
      executionMs: dispersion(selected.map((record) => record.executionMs)),
      requests: selected.reduce((sum, record) => sum + (isGraph(record.observed) ? record.observed.modelCalls : record.observed.requests.length), 0),
      usage: usageTotals(selected), monetaryCost: null,
      outcomes: Object.fromEntries([...new Set(selected.map((r) => r.observed.outcome))].map((outcome) => [outcome, selected.filter((r) => r.observed.outcome === outcome).length])),
      cells: [...new Set(inputs.questions.flatMap((q) => q.expectedCardTypes.map((type) => `${q.domain}/${type}`)))].map((cell) => {
        const rows = selected.filter((record) => record.observed.question.expectedCardTypes.some((type) => `${record.observed.question.domain}/${type}` === cell));
        const repetitions = Array.from({ length: config.repetitions }, (_, index) => {
          const samples = rows.filter((record) => record.repetition === index + 1);
          return { repetition: index + 1, n: samples.length, usableResultRate: rate(samples.map((record) => record.observed.result !== null)) };
        });
        return { cell, n: rows.length, repetitions, usableResultRate: dispersion(repetitions.map((r) => r.usableResultRate).filter((v) => v !== null)) };
      }),
    };
  });
  const strategyPairs = records.filter((record) => record.arm === 'langgraph').map((graphRecord) => {
    const graph = graphRecord.observed as GraphRun;
    const baseline = records.find((record) => record.arm === 'langchain' && record.repetition === graphRecord.repetition && record.observed.question.id === graph.question.id)!;
    const initial = graph.snapshots[0]?.evidence;
    if (initial && JSON.stringify(initial) !== JSON.stringify(baseline.observed.evidence)) throw new Error('Initial strategy evidence differs.');
    const golden = graph.question.goldenEvidenceIds;
    const cumulative = [...new Set(graph.snapshots.flatMap((snapshot) => snapshot.retrievedIds))];
    const baseRecall = recall(baseline.observed.evidence.map((item) => item.id), golden);
    const graphRecall = recall(graph.evidence.map((item) => item.id), golden);
    return {
      questionId: graph.question.id, repetition: graphRecord.repetition,
      baselineOutcome: baseline.observed.outcome, graphOutcome: graph.outcome, stopReason: graph.stopReason,
      baselineFinalIds: baseline.observed.evidence.map((item) => item.id), graphFinalIds: graph.evidence.map((item) => item.id),
      cumulativeFound: cumulative.length, cumulativeRecall: recall(cumulative, golden),
      baselineRecallAtK: baseRecall, graphRecallAtK: graphRecall,
      recallDelta: baseRecall === null || graphRecall === null ? null : graphRecall - baseRecall,
      additionalRequests: graph.modelCalls - (baseline.observed as ExperimentRecord).requests.length,
      semanticSupport: null,
    };
  });
  return {
    version: 'framework-study-report-1', mode, purpose: config.purpose,
    evidenceLevel: mode === 'smoke' ? 'synthetic-integration-only' : config.purpose === 'pilot' ? 'live-pilot-only' : 'live-repeated-study',
    questionCount: inputs.questions.length, repetitions: config.repetitions, questionSetIsBlind: false,
    finalK: policy.maxEvidence, maxUserContextChars: policy.maxContextChars,
    semanticSupport: { method: 'not-reviewed', citationPrecision: null, unsupportedClaimRate: null },
    pricing: { status: 'not-configured', monetaryCost: null },
    failed: records.filter((record) => record.observed.result === null).length,
    arms, paired, strategyPairs,
    examples: {
      success: records.filter((record) => record.observed.result && !record.observed.result.metadata.incomplete).map((record) => `${record.repetition}/${record.observed.question.id}/${record.arm}`),
      failure: records.filter((record) => record.observed.result === null).map((record) => `${record.repetition}/${record.observed.question.id}/${record.arm}`),
      noRetrievalGain: strategyPairs.filter((pair) => pair.recallDelta !== null && pair.recallDelta <= 0).map((pair) => `${pair.repetition}/${pair.questionId}`),
    },
    decision: 'Retain as experiment; adoption requires semantic review and repeated live evaluation.',
  };
}

export type StudySummary = ReturnType<typeof summarizeStudy>;
export function studyMarkdown(summary: StudySummary): string {
  const format = (value: number | null | undefined) => value === null || value === undefined ? 'unavailable' : value.toFixed(3);
  return [
    '# Framework study report', '',
    `Evidence: **${summary.evidenceLevel}**. Questions: ${summary.questionCount}; repetitions: ${summary.repetitions}.`,
    'The question set has been used previously and is not blind. Smoke timings and token counts are synthetic plumbing observations.', '',
    `Final evidence cap: ${summary.finalK}; user-context cap: ${summary.maxUserContextChars} characters.`, '',
    '| Arm | n | Usable result rate (median [min, max]) | Requests |',
    '| --- | ---: | --- | ---: |',
    ...summary.arms.map((arm) => {
      const metric = arm.dispersion['usableResultRate'];
      return `| ${arm.arm} | ${arm.n} | ${format(metric?.median)} [${format(metric?.min)}, ${format(metric?.max)}] | ${arm.requests} |`;
    }), '',
    '| Question / repetition | Baseline final Recall@K | Graph final Recall@K | Cumulative found | Extra requests | Stop |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...summary.strategyPairs.map((pair) => `| ${pair.questionId} / ${pair.repetition} | ${format(pair.baselineRecallAtK)} | ${format(pair.graphRecallAtK)} | ${pair.cumulativeFound} | ${pair.additionalRequests} | ${pair.stopReason} |`), '',
    `Failures: ${summary.failed}; successful complete records: ${summary.examples.success.length}; pairs with no final-recall gain: ${summary.examples.noRetrievalGain.length}.`,
    'An absent example category means it was not observed. Recall is label-based retrieval coverage, not answer quality.', '',
    'See summary.json for per-repetition rates and dispersion, outcome counts, cell sample sizes, execution times, request differences and four separate token totals.',
    'First-attempt card validity counts only completed end_turn final generations; provider failures, truncation and refusal remain separate outcomes. Coverage-only incomplete responses contribute to usable-result rate. Failed results count as incorrect missing-evidence decisions.',
    'Final-context recall uses retained evidence even when no final generation ran; cumulative recall is separate and never substituted for Recall@K.',
    'Semantic citation precision, unsupported-claim rate and monetary cost are unavailable. Reference validity does not establish semantic support.', '',
    summary.decision, '',
  ].join('\n');
}
