import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExperiment, sha256 } from '../src/experiment/inputs.js';
import { adapterById, prepareSamples, runExperiment, type ExperimentRecord } from '../src/experiment/run.js';
import { compareRecords } from '../src/experiment/compare.js';
import { SCENARIOS, type Scenario } from '../src/experiment/fixtures.js';
import { COVERAGE_VERSION, REWRITE_VERSION, CoverageDecision, RewrittenQuery, runGraphExperiment, type GraphRun } from '../src/experiment/graph.js';
import { GRAPH_SCENARIOS, type GraphScenario } from '../src/experiment/graph-fixtures.js';
import { z } from 'zod';

async function main() {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  let live = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!;
    if (name === '--live' && !live) { live = true; continue; }
    if (!['--config', '--out', '--scenario', '--implementation'].includes(name) || values.has(name)) {
      throw new Error(`Unknown or repeated argument: ${name}`);
    }
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.set(name, value);
  }
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const inputs = loadExperiment(repoRoot, resolve(repoRoot, values.get('--config') ??
    (values.get('--implementation') === 'langgraph' ? 'eval/framework/graph.json' : 'eval/framework/config.json')), values.get('--implementation'));
  const isGraph = inputs.config.implementation === 'langgraph';
  const implementations = inputs.config.implementation === 'both' ? ['native', 'langchain'] as const : [inputs.config.implementation];
  const calls = isGraph ? Math.min(inputs.questions.length * inputs.config.graph!.maxModelCallsPerQuestion, inputs.config.maxModelCalls)
    : inputs.questions.length * implementations.length;
  if (calls > inputs.config.maxModelCalls) throw new Error('Sample count across all arms exceeds maxModelCalls.');
  const scenario = values.get('--scenario') ?? (isGraph ? 'demo' : 'valid');
  if (isGraph ? !GRAPH_SCENARIOS.includes(scenario as GraphScenario) : !SCENARIOS.includes(scenario as Scenario)) {
    throw new Error(`Unknown scenario: ${scenario}`);
  }
  if (live && (isGraph ? values.has('--scenario') : scenario !== 'valid')) throw new Error('--scenario fixtures cannot be used with --live.');
  const mode = live ? 'live' : 'smoke';
  // Print before checking credentials or sending any request.
  console.log(`${mode}: ${inputs.questions.length} samples × ${implementations.length} arm(s); at most ${live ? calls : 0} model requests; ` +
    `budget ${inputs.config.maxModelCalls}; SDK retries ${inputs.config.sdkMaxRetries}; repair disabled.`);
  console.log(`profile ${inputs.profile.id}; max_tokens ${inputs.config.maxTokens}; timeout ${inputs.config.timeoutMs}ms`);
  if (live && !process.env[inputs.profile.apiKeyEnv]) throw new Error(`${inputs.profile.apiKeyEnv} is not set.`);
  // The graph owns retrieval; pre-retrieving here would hide a tool call and
  // incorrectly label its adaptive evidence as F2's fixed-input comparison.
  const samples = isGraph ? [] : await prepareSamples(inputs);
  const fixedInputs = samples.map(({ question, evidence }) => ({ question, evidence }));
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const output = resolve(repoRoot, values.get('--out') ?? 'eval/framework/runs', runId);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'run.json'), JSON.stringify({
    version: 'framework-run-2', runId, startedAt: new Date().toISOString(), mode, scenario, implementations,
    purpose: 'Integration smoke test; not an effectiveness evaluation.',
    pins: inputs.pins,
    fixtureVersion: mode === 'smoke' ? (isGraph ? 'bounded-graph-fixture-1' : 'anthropic-sse-fixture-1') : null,
    graph: isGraph ? {
      coverageVersion: COVERAGE_VERSION, rewriteVersion: REWRITE_VERSION,
      coverageSchemaSha256: sha256(JSON.stringify(z.toJSONSchema(CoverageDecision))),
      rewriteSchemaSha256: sha256(JSON.stringify(z.toJSONSchema(RewrittenQuery))),
      evidencePolicy: 'append in retrieval rank order, deduplicate by ID, keep within pinned count and user-context caps',
    } : null,
    fixedInputsSha256: isGraph ? null : sha256(JSON.stringify(fixedInputs)),
    plannedModelRequests: mode === 'smoke' ? 0 : calls,
    usageNote: mode === 'smoke' ? 'Synthetic token counts; latency measures local plumbing only.' : 'null means unavailable; no price estimate.',
  }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(resolve(output, 'inputs.json'), JSON.stringify(isGraph ? inputs.questions : fixedInputs, null, 2) + '\n', { flag: 'wx' });
  const records: (ExperimentRecord | GraphRun)[] = [];
  const budget = { used: 0, limit: inputs.config.maxModelCalls };
  if (isGraph) {
    for (const question of inputs.questions) {
      const record = await runGraphExperiment(inputs, question, { mode, scenario: scenario as GraphScenario, budget });
      records.push(record);
      appendFileSync(resolve(output, 'records.jsonl'), JSON.stringify(record) + '\n');
      console.log(`langgraph ${question.id}: ${record.outcome}; ${record.stopReason}; ${record.modelCalls} adapter requests, ${record.toolCalls} retrievals`);
    }
  } else for (const implementation of implementations) {
    const arm = { ...inputs, config: { ...inputs.config, implementation } };
    records.push(...await runExperiment(arm, {
      mode, scenario: scenario as Scenario, adapter: adapterById(implementation), samples, budget,
    }, (record) => {
      appendFileSync(resolve(output, 'records.jsonl'), JSON.stringify(record) + '\n');
      console.log(`${implementation} ${record.question.id}: ${record.outcome}`);
    }));
  }
  const failed = records.filter((record) => !['valid', 'incomplete'].includes(record.outcome));
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify({
    completedAt: new Date().toISOString(), samples: records.length, failed: failed.length,
    actualModelRequests: mode === 'smoke' ? 0 : budget.used,
    adapterRequests: budget.used,
    outcomes: records.map((record) => ({ implementation: record.implementation, id: record.question.id, outcome: record.outcome })),
    comparison: implementations.length === 2 ? compareRecords(records as ExperimentRecord[]) : null,
  }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Artifacts: ${output}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Experiment failed.');
  process.exitCode = 1;
});
