import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExperimentConfig, sha256 } from '../src/experiment/inputs.js';
import { COVERAGE_VERSION, REWRITE_VERSION } from '../src/experiment/graph.js';
import { StudyConfig, runStudy, summarizeStudy, studyMarkdown, validateStudy } from '../src/experiment/study.js';

async function main() {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  let live = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (name === '--live' && !live) { live = true; continue; }
    if (!['--config', '--out', '--scenario'].includes(name) || values.has(name)) throw new Error(`Unknown or repeated argument: ${name}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.set(name, value);
  }
  const root = resolve(import.meta.dirname, '../../..');
  const source = readFileSync(resolve(root, values.get('--config') ?? 'eval/framework/study-pilot.json'), 'utf8');
  const config = StudyConfig.parse(JSON.parse(source));
  const inputs = loadExperimentConfig(root, config.experiment);
  validateStudy(config, inputs);
  const scenario = values.get('--scenario') ?? 'demo';
  if (scenario !== 'demo' && scenario !== 'invalid-reference') throw new Error(`Unknown scenario: ${scenario}`);
  if (live && values.has('--scenario')) throw new Error('Fixtures require smoke mode.');
  const mode = live ? 'live' : 'smoke';
  const maximum = inputs.questions.length * config.repetitions * 6;
  console.log(`${mode}: ${inputs.questions.length} questions × ${config.repetitions} repetition(s) × 3 arms; at most ${live ? maximum : 0} external model requests; budget ${inputs.config.maxModelCalls}; retries 0; repair disabled.`);
  if (live && !process.env[inputs.profile.apiKeyEnv]) throw new Error(`${inputs.profile.apiKeyEnv} is not set.`);
  // All preflight checks run before creating artifacts or invoking a model.
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const output = resolve(root, values.get('--out') ?? 'eval/framework/runs', id);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'run.json'), JSON.stringify({
    version: 'framework-study-run-1', id, startedAt: new Date().toISOString(), mode, scenario,
    config, configSha256: sha256(source), pins: inputs.pins,
    coverageVersion: COVERAGE_VERSION, rewriteVersion: REWRITE_VERSION,
    orderPolicy: 'rotate native/langchain/langgraph by question index and repetition',
    timingNote: 'executionMs includes a fresh retrieval and orchestration per arm/sample; initial snapshot freezing is excluded for every arm.',
    fixtureVersion: live ? null : 'study-real-retrieval-synthetic-model-1',
    maximumExternalModelRequests: live ? maximum : 0,
  }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(resolve(output, 'inputs.json'), JSON.stringify(inputs.questions, null, 2) + '\n', { flag: 'wx' });
  const { records, budget } = await runStudy(config, inputs, { mode, scenario }, (record) => {
    appendFileSync(resolve(output, 'records.jsonl'), JSON.stringify(record) + '\n');
    console.log(`${record.repetition} ${record.arm} ${record.observed.question.id}: ${record.observed.outcome}`);
  }, (samples) => {
    writeFileSync(resolve(output, 'fixed-inputs.json'), JSON.stringify(samples, null, 2) + '\n', { flag: 'wx' });
  });
  const summary = summarizeStudy(config, inputs, records, mode);
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify({
    ...summary, adapterRequests: budget.used, actualModelRequests: live ? budget.used : 0,
    completedAt: new Date().toISOString(),
  }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(resolve(output, 'report.md'), studyMarkdown(summary), { flag: 'wx' });
  console.log(`Artifacts: ${output}`);
  if (summary.failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Study failed.');
  process.exitCode = 1;
});
