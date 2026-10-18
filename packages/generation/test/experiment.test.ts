import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExperimentConfig, loadExperiment } from '../src/experiment/inputs.js';
import { fixtureCompletion, fixtureFetch } from '../src/experiment/fixtures.js';
import { nativeAdapter, runExperiment } from '../src/experiment/run.js';

const root = resolve(import.meta.dirname, '../../..');
const inputs = loadExperiment(root, resolve(root, 'eval/framework/config.json'));
const temporary: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('framework native baseline', () => {
  it('runs retrieval, the real SDK planner and validation offline; unknown usage stays unavailable', async () => {
    // Any accidental network use fails, including when a real credential exists.
    const network = vi.fn(() => { throw new Error('No network allowed'); });
    vi.stubGlobal('fetch', network);
    const records = await runExperiment(inputs, { mode: 'smoke', scenario: 'valid' });
    expect(records.map((record) => record.outcome)).toEqual(['valid', 'valid', 'incomplete']);
    expect(network).not.toHaveBeenCalled();
    for (const record of records) {
      expect(record.evidence.length).toBeGreaterThan(0);
      expect(record.evidence[0]!.retrievalScore).toBeGreaterThan(0);
      expect(record.attempts).toHaveLength(1);
      expect(record.attempts[0]!.model).toBe('offline-fixture');
      expect(record.attempts[0]!.usage.cacheCreationInputTokens).toBeNull();
      expect(record.attempts[0]!.usage.cacheReadInputTokens).toBeNull();
      expect(record.validation).toMatchObject({ originalValid: true, finalValid: true, repairAttempted: false });
      expect(record.result).not.toBeNull();
    }
    expect(records[1]!.result!.cards[0]!.type).toBe('comparison');
  });

  it.each([
    ['malformed', 'invalid', 'schema'],
    ['invalid-reference', 'invalid', 'evidence-reference'],
    ['provider-error', 'provider-error', null],
    ['truncated', 'truncated', null],
    ['refusal', 'refused', null],
  ] as const)('records %s as %s without a validated result', async (scenario, outcome, stage) => {
    const records = await runExperiment(inputs, { mode: 'smoke', scenario });
    for (const record of records) {
      expect(record.outcome).toBe(outcome);
      expect(record.result).toBeNull();
      expect(record.validation.originalValid).toBe(false);
      expect(record.validation.repairAttempted).toBe(false);
      if (stage) expect(record.validation.failures[0]!.stage).toBe(stage);
      if (scenario === 'provider-error') {
        expect(record.error).toMatchObject({ status: 503 });
        expect(record.attempts).toEqual([]);
      } else {
        expect(record.raw).not.toBeNull();
      }
    }
  });

  it('captures the real request, zero retries, pinned token limit, and both effort and schema', async () => {
    let requests = 0;
    let body: Record<string, unknown> = {};
    const adapter = {
      id: 'native',
      plan: async (options: Parameters<typeof nativeAdapter.plan>[0]) => {
        expect(options.maxRetries).toBe(0);
        expect(options.timeoutMs).toBe(inputs.config.timeoutMs);
        const response = fixtureFetch(fixtureCompletion(inputs.questions[0]!, options.evidence, 'valid'), 'valid');
        return nativeAdapter.plan({
          ...options,
          profile: { ...options.profile, supportsEffort: true, enforcesOutputSchema: true },
          fetch: async (url, init) => {
            requests++;
            body = JSON.parse(init!.body as string) as Record<string, unknown>;
            return response(url, init);
          },
        });
      },
    };
    await runExperiment({ ...inputs, questions: inputs.questions.slice(0, 1) }, { mode: 'smoke', scenario: 'valid', adapter });
    expect(requests).toBe(1);
    expect(body['max_tokens']).toBe(inputs.config.maxTokens);
    expect(body['output_config']).toMatchObject({ effort: 'high', format: { type: 'json_schema' } });
  });

  it('does not retry provider failures despite the SDK default retry policy', async () => {
    let calls = 0;
    const adapter = {
      id: 'native',
      plan: (options: Parameters<typeof nativeAdapter.plan>[0]) => nativeAdapter.plan({
        ...options,
        fetch: async (...args) => { calls++; return fixtureFetch('', 'provider-error')(...args); },
      }),
    };
    await runExperiment(inputs, { mode: 'smoke', scenario: 'provider-error', adapter });
    expect(calls).toBe(inputs.questions.length);
  });

  it('retains partial output and saves only safe provider error metadata', async () => {
    const adapter = {
      id: 'native',
      plan: async (options: Parameters<typeof nativeAdapter.plan>[0]): Promise<never> => {
        options.onDelta?.('{"cards":');
        throw Object.assign(new Error('secret-key in a provider error'), { name: 'APIError', status: 502 });
      },
    };
    const [record] = await runExperiment({ ...inputs, questions: inputs.questions.slice(0, 1) }, {
      mode: 'smoke', scenario: 'valid', adapter,
    });
    expect(record!.raw).toBe('{"cards":');
    expect(record!.outcome).toBe('provider-error');
    expect(record!.result).toBeNull();
    expect(record!.error).toEqual({ name: 'APIError', status: 502 });
    expect(JSON.stringify(record)).not.toContain('secret-key');
  });

  it('rejects invalid configuration or an over-budget run before invoking an adapter', async () => {
    for (const update of [{ k: 0 }, { maxTokens: -1 }, { sdkMaxRetries: 1 }, { questionIds: ['rag-001', 'rag-001'] }]) {
      expect(ExperimentConfig.safeParse({ ...inputs.config, ...update }).success).toBe(false);
    }
    const plan = vi.fn(nativeAdapter.plan);
    await expect(runExperiment({ ...inputs, config: { ...inputs.config, maxModelCalls: 1 } }, {
      mode: 'smoke', scenario: 'valid', adapter: { id: 'native', plan },
    })).rejects.toThrow(/budget/);
    expect(plan).not.toHaveBeenCalled();
  });

  it('refuses envelope inconsistencies, invented evidence-card references, and extractive misattribution', async () => {
    for (const raw of [
      JSON.stringify({ cards: [], incomplete: true }),
      JSON.stringify({ cards: [], incomplete: false }),
      JSON.stringify({ cards: [{ id: 'bad', type: 'evidence', title: 'Bad', evidenceIds: ['E999'] }], incomplete: false }),
      JSON.stringify({ cards: [{ id: 'bad', type: 'definition', title: 'Bad',
        definition: { text: 'These words occur in no passage.', evidenceIds: ['E1'], mode: 'extractive' },
        keyPoints: [{ text: 'These words occur in no passage.', evidenceIds: ['E1'], mode: 'extractive' }],
      }], incomplete: false }),
    ]) {
      const adapter = {
        id: 'native',
        plan: (options: Parameters<typeof nativeAdapter.plan>[0]) => nativeAdapter.plan({ ...options, fetch: fixtureFetch(raw, 'valid') }),
      };
      const [record] = await runExperiment({ ...inputs, questions: inputs.questions.slice(0, 1) }, { mode: 'smoke', scenario: 'valid', adapter });
      expect(record!.outcome).toBe('invalid');
      expect(record!.result).toBeNull();
      expect(record!.raw).toBe(raw);
    }
  });

  it('writes unique inspectable runs through the CLI and returns nonzero for failed records', () => {
    const output = mkdtempSync(join(tmpdir(), 'framework-test-'));
    temporary.push(output);
    const cli = resolve(root, 'packages/generation/scripts/experiment.ts');
    const launch = (extra: string[] = []) => spawnSync(process.execPath, ['--import', 'tsx', cli, '--out', output, ...extra], {
      encoding: 'utf8', cwd: resolve(root, 'packages/generation'),
    });
    expect(launch().status).toBe(0);
    expect(launch().status).toBe(0);
    expect(launch(['--scenario', 'invalid-reference']).status).toBe(1);
    const dirs = readdirSync(output);
    expect(dirs).toHaveLength(3);
    const header = JSON.parse(readFileSync(join(output, dirs[0]!, 'run.json'), 'utf8'));
    expect(header.pins).toMatchObject({
      code: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() },
      corpus: { version: inputs.pins.corpus.version },
      config: { sdkMaxRetries: 0 },
    });
    expect(header.pins.code.treeSha256).toHaveLength(64);
    expect(header.plannedModelRequests).toBe(0);
    expect(header.mode).toBe('smoke');
    const unknown = join(output, 'bad-config.json');
    writeFileSync(unknown, JSON.stringify({ ...inputs.config, questionIds: ['unknown'] }));
    expect(launch(['--config', unknown]).status).toBe(1);
    expect(launch(['--implementation', 'unknown']).status).toBe(1);
    expect(launch(['--scenario', 'unknown']).status).toBe(1);
    expect(launch(['--live', '--scenario', 'provider-error']).status).toBe(1);
  }, 20000);
});
