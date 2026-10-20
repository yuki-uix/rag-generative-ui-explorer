import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeUIResponse } from '@rgux/contracts';
import { ExperimentConfig, loadExperiment } from '../src/experiment/inputs.js';
import { CoverageDecision, createRetrievalTool, runGraphExperiment } from '../src/experiment/graph.js';
import { graphFixture, type GraphScenario } from '../src/experiment/graph-fixtures.js';
import { fixtureFetch } from '../src/experiment/fixtures.js';

const root = resolve(import.meta.dirname, '../../..');
const inputs = loadExperiment(root, resolve(root, 'eval/framework/graph.json'));
const temporary: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
const run = (scenario: GraphScenario, selected = inputs) => runGraphExperiment(selected, selected.questions[0]!, {
  mode: 'smoke', scenario, budget: { used: 0, limit: selected.config.maxModelCalls },
});

describe('bounded LangGraph retrieval', () => {
  it('executes all three branches through the real tool, LangGraph, SDK and output gate offline', async () => {
    const network = vi.fn(() => { throw new Error('Network forbidden'); });
    vi.stubGlobal('fetch', network);
    const budget = { used: 0, limit: 12 };
    const records = [];
    for (const question of inputs.questions) {
      records.push(await runGraphExperiment(inputs, question, { mode: 'smoke', scenario: 'demo', budget }));
    }
    expect(network).not.toHaveBeenCalled();
    expect(records.map((r) => [r.outcome, r.stopReason, r.modelCalls, r.toolCalls])).toEqual([
      ['valid', 'generation-valid', 2, 1],
      ['valid', 'generation-valid', 4, 2],
      ['incomplete', 'supplement-limit', 3, 2],
    ]);
    expect(budget.used).toBe(9);
    const supplemented = records[1]!;
    expect(supplemented.missingItems).toEqual([]);
    expect(supplemented.queryHistory).toHaveLength(2);
    expect(supplemented.snapshots[1]!.addedIds.length).toBeGreaterThan(0);
    expect(supplemented.evidence.map((e) => e.id)).toEqual([...new Set(supplemented.evidence.map((e) => e.id))]);
    expect(supplemented.generation!.evidence).toEqual(supplemented.snapshots[1]!.evidence);
    expect(supplemented.calls.map((c) => c.kind)).toEqual(['coverage', 'rewrite', 'coverage', 'generation']);
    expect(supplemented.calls[3]!.evidenceIds).toEqual(supplemented.evidence.map((e) => e.id));
    for (const record of records) {
      expect(KnowledgeUIResponse.safeParse(record.result).success).toBe(true);
      expect(record.modelCalls).toBe(record.calls.flatMap((c) => c.requests).length);
      expect(record.timingMs.every((t) => t.elapsed >= 0)).toBe(true);
      for (const call of record.calls) {
        expect(call.requests).toHaveLength(1);
        expect(call.requests[0]!.status).toBe(200);
        expect(call.requests[0]!.body).toMatchObject({
          max_tokens: call.kind === 'generation' ? inputs.config.maxTokens : inputs.config.graph!.controlMaxTokens,
        });
        expect(call.plan!.usage.cacheReadInputTokens).toBeNull();
      }
    }
    expect(records[2]!.result!.metadata).toMatchObject({ incomplete: true, incompleteReason: 'missing' });
    expect(records[2]!.calls.some((c) => c.kind === 'generation')).toBe(false);
  });

  it.each([
    ['still-missing', 'supplement-limit', 'incomplete', 3, 2],
    ['repeated-query', 'repeated-query', 'incomplete', 2, 1],
    ['no-new-evidence', 'no-new-evidence', 'incomplete', 2, 2],
    ['tool-error', 'retrieval-error', 'error', 0, 1],
    ['supplement-tool-error', 'retrieval-error', 'error', 2, 2],
    ['coverage-invalid', 'coverage-invalid', 'error', 1, 1],
    ['rewrite-invalid', 'rewrite-invalid', 'error', 2, 1],
    ['provider-error', 'coverage-provider-error', 'error', 1, 1],
    ['truncated', 'coverage-max_tokens', 'error', 1, 1],
    ['refusal', 'coverage-refusal', 'error', 1, 1],
    ['conflicting', 'conflicting-evidence', 'incomplete', 1, 1],
    ['invalid-reference', 'generation-invalid', 'error', 2, 1],
  ] as const)('%s stops explicitly without retry or fabricated success', async (scenario, reason, outcome, calls, tools) => {
    const result = await run(scenario);
    expect([result.stopReason, result.outcome, result.modelCalls, result.toolCalls]).toEqual([reason, outcome, calls, tools]);
    if (outcome === 'error') expect(result.result).toBeNull();
    if (scenario.includes('tool-error')) {
      expect(result.error).toEqual({ name: 'TimeoutError', status: null });
      expect(result.result).toBeNull();
    }
    if (scenario === 'conflicting') expect(result.result!.metadata).toMatchObject({ incomplete: true, incompleteReason: 'conflicting' });
    if (scenario === 'invalid-reference') {
      expect(result.generation!.validation.failures[0]!.stage).toBe('evidence-reference');
      expect(result.calls.at(-1)!.raw).toContain('E999');
    }
  });

  it('enforces both the per-question cap and the shared actual HTTP budget', async () => {
    for (const limit of [1, 2, 3]) {
      const selected = { ...inputs, config: { ...inputs.config, graph: { ...inputs.config.graph!, maxModelCallsPerQuestion: limit } } };
      const result = await run('supplemented', selected);
      expect(result.modelCalls).toBe(limit);
      expect(result.stopReason).toBe('budget-exhausted');
      expect(result.result).toBeNull();
    }
    const budget = { used: 0, limit: 3 };
    const first = await runGraphExperiment(inputs, inputs.questions[0]!, { mode: 'smoke', scenario: 'sufficient', budget });
    const second = await runGraphExperiment(inputs, inputs.questions[1]!, { mode: 'smoke', scenario: 'sufficient', budget });
    expect([first.modelCalls, second.modelCalls, budget.used]).toEqual([2, 1, 3]);
    expect(second.stopReason).toBe('budget-exhausted');
  });

  it('validates tool parameters before invoking the existing retriever', async () => {
    const search = vi.fn(inputs.retriever.search.bind(inputs.retriever));
    const tool = createRetrievalTool({ search }, 4);
    await expect(tool.invoke({ query: '', k: 4 })).rejects.toThrow();
    await expect(tool.invoke({ query: 'BM25', k: 5 })).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
    await tool.invoke({ query: 'BM25', k: 4 });
    expect(search).toHaveBeenCalledWith('BM25', 4);
  });

  it('bounds evidence count and context, rejects unknown tool IDs, and records actual retrieval timeouts', async () => {
    const capped = { ...inputs, config: { ...inputs.config, graph: { ...inputs.config.graph!, maxEvidence: 2 } } };
    const result = await run('no-new-evidence', capped);
    expect(result.evidence).toHaveLength(2);
    expect(result.snapshots.every((s) => s.contextChars <= capped.config.graph!.maxContextChars)).toBe(true);
    const single = await run('sufficient', { ...inputs, config: { ...inputs.config, graph: { ...inputs.config.graph!, maxEvidence: 1 } } });
    expect(single.outcome).toBe('valid');
    expect(single.generation!.evidence).toHaveLength(1);
    const tiny = { ...inputs, config: { ...inputs.config, graph: { ...inputs.config.graph!, maxContextChars: 500 } } };
    const context = await run('sufficient', tiny);
    expect(context.outcome).toBe('error');
    expect(context.stopReason).toContain('context-limit');
    expect(context.result).toBeNull();
    for (const retriever of [
      { search: async () => [{ evidenceId: 'invented-corpus-id', score: 1 }] },
      { search: () => new Promise<never>(() => {}) },
    ]) {
      const record = await runGraphExperiment({ ...inputs, config: { ...inputs.config, timeoutMs: 20 } }, inputs.questions[0]!, {
        mode: 'smoke', scenario: 'sufficient', budget: { used: 0, limit: 4 }, retriever,
      });
      expect(record.stopReason).toBe('retrieval-error');
      expect(record.result).toBeNull();
      expect(record.modelCalls).toBe(0);
    }
  });

  it('rejects duplicate or unknown coverage references and never cites withheld corpus evidence', async () => {
    expect(CoverageDecision.safeParse({ status: 'conflicting', missingItems: [], reason: 'conflict', evidenceIds: ['E1', 'E1'] }).success).toBe(false);
    const record = await runGraphExperiment(inputs, inputs.questions[0]!, {
      mode: 'smoke', scenario: 'sufficient', budget: { used: 0, limit: 4 },
      transport: (kind, state) => kind === 'generation' ? fixtureFetch(JSON.stringify({ cards: [{
        id: 'outside', type: 'evidence', title: 'Not retrieved', evidenceIds: ['E5'],
      }], incomplete: false }), 'valid') : graphFixture(kind, state, 'sufficient'),
    });
    expect(record.evidence).toHaveLength(4);
    expect(record.outcome).toBe('error');
    expect(record.generation!.validation.failures[0]!.stage).toBe('evidence-reference');
    expect(record.result).toBeNull();
  });

  it('persists three complete CLI traces, reports payload failures, and preflights live mode', () => {
    const output = mkdtempSync(join(tmpdir(), 'graph-cli-'));
    temporary.push(output);
    const cli = resolve(root, 'packages/generation/scripts/experiment.ts');
    const launch = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, '--implementation', 'langgraph', '--out', output, ...args], {
      encoding: 'utf8', cwd: resolve(root, 'packages/generation'), env: { ...process.env, [inputs.profile.apiKeyEnv]: '' },
    });
    const ok = launch([]);
    expect(ok.status, ok.stderr).toBe(0);
    const directory = join(output, readdirSync(output)[0]!);
    const manifest = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'));
    expect(manifest.fixedInputsSha256).toBeNull();
    expect(manifest.graph.coverageSchemaSha256).toHaveLength(64);
    expect(manifest.pins.runtime.langchain.langgraph).toBe('1.5.1');
    const records = readFileSync(join(directory, 'records.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(records).toHaveLength(3);
    expect(records[1].snapshots).toHaveLength(2);
    const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
    expect(summary).toMatchObject({ failed: 0, actualModelRequests: 0, adapterRequests: 9, comparison: null });
    expect(launch(['--scenario', 'invalid-reference']).status).toBe(1);
    expect(launch(['--live']).status).toBe(1);
    expect(launch(['--live', '--scenario', 'demo']).status).toBe(1);
    expect(launch(['--scenario', 'unknown']).status).toBe(1);
    // Neither missing credentials nor malformed config creates a partial run.
    expect(readdirSync(output)).toHaveLength(2);
    const config = join(output, 'invalid-config.json');
    writeFileSync(config, JSON.stringify({ ...inputs.config, graph: undefined }));
    expect(launch(['--config', config]).status).toBe(1);
    expect(ExperimentConfig.safeParse({ ...inputs.config, sdkMaxRetries: 1 }).success).toBe(false);
  }, 20000);
});
