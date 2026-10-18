import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadExperiment } from '../src/experiment/inputs.js';
import { sha256 } from '../src/experiment/inputs.js';
import { fixtureCompletion, fixtureFetch } from '../src/experiment/fixtures.js';
import { explicitEnumTypes } from '../src/experiment/langchain.js';
import { nativeAdapter, langchainAdapter, prepareSamples, runExperiment, type ExperimentRecord } from '../src/experiment/run.js';
import { compareRecords } from '../src/experiment/compare.js';

const root = resolve(import.meta.dirname, '../../..');
const inputs = loadExperiment(root, resolve(root, 'eval/framework/comparison.json'));
const arm = (implementation: 'native' | 'langchain') => ({ ...inputs, config: { ...inputs.config, implementation } });

describe.each(['native', 'langchain'] as const)('%s real adapter', (implementation) => {
  it.each([
    ['valid', ['valid', 'valid', 'incomplete']],
    ['malformed', ['invalid', 'invalid', 'invalid']],
    ['invalid-reference', ['invalid', 'invalid', 'invalid']],
    ['truncated', ['truncated', 'truncated', 'truncated']],
    ['refusal', ['refused', 'refused', 'refused']],
    ['provider-error', ['provider-error', 'provider-error', 'provider-error']],
  ] as const)('records %s without skipping the common gate', async (scenario, expected) => {
    const records = await runExperiment(arm(implementation), { mode: 'smoke', scenario });
    expect(records.map((record) => record.outcome)).toEqual(expected);
    for (const record of records) {
      expect(record.requests).toHaveLength(1); // Both framework and SDK retry policies are zero.
      if (scenario !== 'valid') expect(record.result).toBeNull();
      if (scenario === 'invalid-reference') {
        expect(record.raw).toContain('E999');
        expect(record.validation.failures[0]!.stage).toBe('evidence-reference');
      }
      if (scenario === 'malformed') {
        expect(record.raw).toBe('{"cards":');
        expect(record.validation.failures[0]!.stage).toBe('schema');
      }
      if (scenario === 'provider-error') expect(record.error).toMatchObject({ status: 503 });
      else {
        expect(record.attempts[0]!.schemaEnforced).toBe(false);
        expect(record.attempts[0]!.usage.cacheReadInputTokens).toBeNull();
      }
    }
  });

  it('maps cache-inclusive LangChain token counts back to native accounting', async () => {
    const adapter = implementation === 'native' ? nativeAdapter : langchainAdapter;
    const [sample] = await prepareSamples(inputs);
    const raw = fixtureCompletion(sample!.question, sample!.evidence, 'valid');
    const fetch: typeof globalThis.fetch = async (...args) => {
      const response = await fixtureFetch(raw, 'valid')(...args);
      const body = (await response.text()).replace('"input_tokens":100,"output_tokens":0',
        '"input_tokens":100,"output_tokens":0,"cache_creation_input_tokens":10,"cache_read_input_tokens":20');
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    };
    const record = await adapter.plan({
      profile: inputs.profile, question: sample!.question.question, evidence: sample!.evidence,
      schema: inputs.schema, apiKey: 'fixture', fetch, maxRetries: 0,
    });
    expect(record.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 10, cacheReadInputTokens: 20 });
  });
});

describe('paired framework comparison', () => {
  it('keeps the published real run internally consistent and retains the truncated failure', () => {
    const dir = resolve(root, 'eval/framework/results/f2-2026-10-18');
    const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    const fixed = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8'));
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const records = readFileSync(join(dir, 'records.jsonl'), 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line) as ExperimentRecord);
    expect(run.mode).toBe('live');
    expect(sha256(JSON.stringify(fixed))).toBe(run.fixedInputsSha256);
    expect(summary.actualModelRequests).toBe(6);
    expect(records.flatMap((record) => record.requests)).toHaveLength(6);
    expect(records.filter((record) => record.outcome === 'truncated')).toHaveLength(1);
    expect(records.find((record) => record.outcome === 'truncated')!.result).toBeNull();
    expect(compareRecords(records)).toEqual(summary.comparison);
  });

  it('retrieves once, pins identical evidence and prompt text, and exposes actual wire differences', async () => {
    const search = vi.spyOn(inputs.retriever, 'search');
    const samples = await prepareSamples(inputs);
    const budget = { used: 0, limit: 6 };
    const records: ExperimentRecord[] = [];
    for (const implementation of ['native', 'langchain'] as const) {
      records.push(...await runExperiment(arm(implementation), { mode: 'smoke', scenario: 'valid', samples, budget }));
    }
    expect(search).toHaveBeenCalledTimes(3);
    search.mockRestore();
    expect(budget.used).toBe(6);
    const pairs = compareRecords(records);
    for (const pair of pairs) {
      expect(pair).toMatchObject({ sameEvidence: true, samePrompt: true, sameModelSettings: true });
      expect(pair.requestBodyDifferences).toContain('output_config');
    }
    for (const record of records.filter((item) => item.implementation === 'langchain')) {
      expect(record.attempts[0]!.framework).toMatchObject({
        name: 'langchain', method: 'jsonSchema', parser: 'JsonOutputParser', schemaValidated: false, parserSucceeded: true,
      });
      const body = record.requests[0]!.body as Record<string, unknown>;
      expect(body['tools']).toBeUndefined();
      expect(body['tool_choice']).toBeUndefined();
      expect(body['temperature']).toBeUndefined();
    }
    const first = records[0]!;
    const changed = records.map((record) => record.implementation === 'langchain'
      ? { ...record, evidence: [] } : record);
    expect(() => compareRecords(changed)).toThrow(/invariants/);
    expect(first.evidence.length).toBeGreaterThan(0);
  });

  it('fixes the SDK enum type precondition without mutating the shared schema', () => {
    const before = JSON.stringify(inputs.schema);
    const transformed = explicitEnumTypes(inputs.schema) as { properties: { incompleteReason: { type: string } } };
    expect(transformed.properties.incompleteReason.type).toBe('string');
    expect(JSON.stringify(inputs.schema)).toBe(before);
  });

  it('does not treat framework parsing as schema or citation validation', async () => {
    const [sample] = await prepareSamples(inputs);
    const record = await langchainAdapter.plan({
      profile: inputs.profile, question: sample!.question.question, evidence: sample!.evidence,
      schema: inputs.schema, apiKey: 'fixture', maxRetries: 0,
      fetch: fixtureFetch('{"cards":[],"incomplete":false}', 'valid'),
    });
    expect(record.framework!.parserSucceeded).toBe(true);
    expect(record.framework!.schemaValidated).toBe(false);
    const adapter = { id: 'langchain', plan: async () => record };
    const [result] = await runExperiment({ ...arm('langchain'), questions: inputs.questions.slice(0, 1) }, {
      mode: 'smoke', scenario: 'valid', samples: [sample!], adapter,
    });
    expect(result!.outcome).toBe('invalid');
    expect(result!.result).toBeNull();
  });

  it('enforces the total transport budget even if an adapter tries a second call', async () => {
    const adapter = { id: 'native', plan: async (options: Parameters<typeof nativeAdapter.plan>[0]) => {
      await nativeAdapter.plan(options);
      return nativeAdapter.plan(options);
    } };
    const [record] = await runExperiment({ ...arm('native'), questions: inputs.questions.slice(0, 1) }, {
      mode: 'smoke', scenario: 'valid', adapter, budget: { used: 0, limit: 1 },
    });
    expect(record!.requests).toHaveLength(1);
    expect(record!.outcome).toBe('budget-exceeded');
  });

  it('distinguishes a local schema adapter failure from a provider failure', async () => {
    const [record] = await runExperiment({ ...arm('langchain'), schema: {}, questions: inputs.questions.slice(0, 1) }, {
      mode: 'smoke', scenario: 'valid',
    });
    expect(record!.requests).toHaveLength(0);
    expect(record!.outcome).toBe('adapter-error');
    expect(record!.result).toBeNull();
  });

  it('runs both arms from one CLI command and saves a fixed-input fingerprint', () => {
    const out = mkdtempSync(join(tmpdir(), 'langchain-pair-'));
    try {
      const cli = resolve(root, 'packages/generation/scripts/experiment.ts');
      const launch = (extra: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, '--out', out, ...extra], {
        cwd: resolve(root, 'packages/generation'), encoding: 'utf8',
      });
      const result = launch(['--config', 'eval/framework/comparison.json']);
      expect(result.status, result.stderr).toBe(0);
      const dir = join(out, readdirSync(out)[0]!);
      const header = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
      const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
      expect(header.implementations).toEqual(['native', 'langchain']);
      expect(header.fixedInputsSha256).toHaveLength(64);
      expect(header.pins.runtime.langchain).toMatchObject({ anthropic: '1.5.12', core: '1.2.18', sdk: '0.122.0' });
      expect(summary.actualModelRequests).toBe(0);
      expect(summary.adapterRequests).toBe(6);
      expect(summary.comparison).toHaveLength(3);
      expect(launch(['--implementation', 'langchain']).status).toBe(0);
      expect(launch(['--implementation', 'both']).status).toBe(1); // F1 config only budgets three calls.
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 20000);
});
