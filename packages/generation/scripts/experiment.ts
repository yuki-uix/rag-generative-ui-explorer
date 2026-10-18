import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExperiment } from '../src/experiment/inputs.js';
import { runExperiment } from '../src/experiment/run.js';
import { SCENARIOS, type Scenario } from '../src/experiment/fixtures.js';

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
  const inputs = loadExperiment(repoRoot, resolve(repoRoot, values.get('--config') ?? 'eval/framework/config.json'));
  const implementation = values.get('--implementation') ?? inputs.config.implementation;
  if (implementation !== inputs.config.implementation) throw new Error(`Unsupported implementation: ${implementation}`);
  const scenario = values.get('--scenario') ?? 'valid';
  if (!SCENARIOS.includes(scenario as Scenario)) throw new Error(`Unknown scenario: ${scenario}`);
  if (live && scenario !== 'valid') throw new Error('--scenario fixtures cannot be used with --live.');
  const mode = live ? 'live' : 'smoke';
  // Print before checking credentials or sending any request.
  console.log(`${mode}: ${inputs.questions.length} samples; at most ${live ? inputs.questions.length : 0} model requests; ` +
    `budget ${inputs.config.maxModelCalls}; SDK retries ${inputs.config.sdkMaxRetries}; repair disabled.`);
  console.log(`profile ${inputs.profile.id}; max_tokens ${inputs.config.maxTokens}; timeout ${inputs.config.timeoutMs}ms`);
  if (live && !process.env[inputs.profile.apiKeyEnv]) throw new Error(`${inputs.profile.apiKeyEnv} is not set.`);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const output = resolve(repoRoot, values.get('--out') ?? 'eval/framework/runs', runId);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'run.json'), JSON.stringify({
    version: 'framework-run-1', runId, startedAt: new Date().toISOString(), mode, scenario,
    purpose: 'Integration smoke test; not an effectiveness evaluation.',
    pins: inputs.pins,
    fixtureVersion: mode === 'smoke' ? 'anthropic-sse-fixture-1' : null,
    plannedModelRequests: mode === 'smoke' ? 0 : inputs.questions.length,
    usageNote: mode === 'smoke' ? 'Synthetic token counts; latency measures local plumbing only.' : 'null means unavailable; no price estimate.',
  }, null, 2) + '\n', { flag: 'wx' });
  const records = await runExperiment(inputs, { mode, scenario: scenario as Scenario }, (record) => {
    appendFileSync(resolve(output, 'records.jsonl'), JSON.stringify(record) + '\n');
    console.log(`${record.question.id}: ${record.outcome}`);
  });
  const failed = records.filter((record) => !['valid', 'incomplete'].includes(record.outcome));
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify({
    completedAt: new Date().toISOString(), samples: records.length, failed: failed.length,
    actualModelRequests: mode === 'smoke' ? 0 : records.length,
    outcomes: records.map((record) => ({ id: record.question.id, outcome: record.outcome })),
  }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Artifacts: ${output}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Experiment failed.');
  process.exitCode = 1;
});
