import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExperimentConfig, ExperimentConfig } from '../src/experiment/inputs.js';
import { ARMS, StudyConfig, dispersion, runStudy, summarizeStudy, studyMarkdown, usageTotals } from '../src/experiment/study.js';
import { selectContext } from '../src/experiment/context.js';
import type { GraphRun } from '../src/experiment/graph.js';
import type { ExperimentRecord } from '../src/experiment/run.js';

const root = resolve(import.meta.dirname, '../../..');
const config = StudyConfig.parse(JSON.parse(readFileSync(resolve(root, 'eval/framework/study-pilot.json'), 'utf8')));
const inputs = loadExperimentConfig(root, config.experiment);
const temporary: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('F5 controlled study', () => {
  it('runs all three arms offline, preserves fixed-evidence pairs, and keeps cumulative recall separate', async () => {
    const network = vi.fn(() => { throw new Error('No network'); });
    vi.stubGlobal('fetch', network);
    const search = vi.spyOn(inputs.retriever, 'search');
    let prepared = false;
    const { records, budget } = await runStudy(config, inputs, { mode: 'smoke', scenario: 'demo' }, () => {
      expect(prepared).toBe(true);
    }, (samples) => { expect(samples).toHaveLength(3); prepared = true; });
    expect(network).not.toHaveBeenCalled();
    // 3 frozen snapshots, 6 actual baseline lookups and 5 graph tool lookups.
    expect(search).toHaveBeenCalledTimes(14);
    expect(records).toHaveLength(9);
    expect(budget.used).toBe(15);
    expect(records.slice(0, 3).map((record) => record.arm)).toEqual([...ARMS]);
    expect(records.slice(3, 6).map((record) => record.arm)).toEqual(['langchain', 'langgraph', 'native']);
    const summary = summarizeStudy(config, inputs, records, 'smoke');
    expect(summary.evidenceLevel).toBe('synthetic-integration-only');
    expect(summary.failed).toBe(0);
    expect(summary.arms.map((arm) => arm.requests)).toEqual([3, 3, 9]);
    expect(summary.arms.every((arm) => arm.usage['cacheReadInputTokens'] === null && arm.monetaryCost === null)).toBe(true);
    expect(summary.semanticSupport).toEqual({ method: 'not-reviewed', citationPrecision: null, unsupportedClaimRate: null });
    expect(summary.paired[0]!.pairs.every((pair) => pair.sameEvidence && pair.samePrompt && pair.sameModelSettings)).toBe(true);
    const pair = summary.strategyPairs.find((pair) => pair.questionId === 'rag-003')!;
    expect(pair.graphFinalIds).toHaveLength(4);
    expect(pair.cumulativeFound).toBeGreaterThan(4);
    expect(pair.cumulativeRecall).toBeGreaterThanOrEqual(pair.graphRecallAtK!);
    const graph = records.find((record) => record.arm === 'langgraph' && record.observed.question.id === 'rag-003')!.observed as GraphRun;
    expect(graph.snapshots[1]!.droppedIds.length).toBeGreaterThan(0);
    expect(graph.generation!.evidence).toEqual(graph.snapshots[1]!.evidence);
    expect(summary.examples.noRetrievalGain).toContain('1/rag-001');
    expect(summary.strategyPairs[0]!.additionalRequests).toBe(1);
    expect(studyMarkdown(summary)).toContain('synthetic-integration-only');
  });

  it('reports real validation failures and unavailable usage rather than silently pooling them as valid', async () => {
    const { records } = await runStudy(config, inputs, { mode: 'smoke', scenario: 'invalid-reference' });
    const summary = summarizeStudy(config, inputs, records, 'smoke');
    expect(summary.failed).toBe(9);
    expect(summary.examples.success).toEqual([]);
    expect(summary.examples.failure).toHaveLength(9);
    expect(summary.arms.every((arm) => arm.repetitions[0]!.firstAttemptCardValidity === 0)).toBe(true);
    expect(summary.arms.every((arm) => arm.repetitions[0]!.evidenceReferenceFailureN === 3)).toBe(true);
    const native = records.find((record) => record.arm === 'native')!.observed as ExperimentRecord;
    native.attempts = [];
    native.outcome = 'provider-error';
    const usage = usageTotals(records.filter((record) => record.arm === 'native'));
    expect(Object.values(usage).every((value) => value === null)).toBe(true);
    const updated = summarizeStudy(config, inputs, records, 'smoke');
    expect(updated.arms[0]!.repetitions[0]).toMatchObject({ generatedN: 3, completedGenerationN: 2, evidenceReferenceFailureN: 2 });
  });

  it('rejects stale pins, incomplete studies, duplicates and drift in the actual wire request', async () => {
    const { records } = await runStudy(config, inputs, { mode: 'smoke', scenario: 'demo' });
    expect(() => summarizeStudy(config, inputs, records.slice(1), 'smoke')).toThrow(/Missing/);
    expect(() => summarizeStudy(config, inputs, [...records.slice(0, -1), records[0]!], 'smoke')).toThrow(/duplicate/);
    await expect(runStudy({ ...config, expected: { ...config.expected, questionSetSha256: '0'.repeat(64) } }, inputs, { mode: 'smoke', scenario: 'demo' })).rejects.toThrow(/pins/);
    for (const mutate of [
      (record: ExperimentRecord) => { (record.requests[0]!.body as Record<string, unknown>)['max_tokens'] = 123; },
      (record: ExperimentRecord) => { (record.requests[0]!.body as Record<string, unknown>)['temperature'] = 0.5; },
      (record: ExperimentRecord) => { (record.requests[0]!.body as Record<string, unknown>)['system'] = 'changed prompt'; },
      (record: ExperimentRecord) => { record.requests[0]!.url = 'https://api.deepseek.com.evil.example/anthropic/v1/messages'; },
    ]) {
      const changed = structuredClone(records);
      mutate(changed.find((record) => record.arm === 'native')!.observed as ExperimentRecord);
      expect(() => summarizeStudy(config, inputs, changed, 'smoke')).toThrow(/Pinned/);
    }
    const changed = structuredClone(records);
    const graph = changed.find((record) => record.arm === 'langgraph')!.observed as GraphRun;
    graph.snapshots[0]!.evidence = [];
    expect(() => summarizeStudy(config, inputs, changed, 'smoke')).toThrow(/Initial strategy/);
  });

  it('keeps the context budget fixed while replacing passages, without consulting golden labels', () => {
    const evidence = [...inputs.evidenceById.values()].slice(0, 8);
    const selected = selectContext('What is retrieval?', evidence.slice(0, 4), [...evidence.slice(0, 1), ...evidence.slice(4)], inputs.config.graph!);
    expect(selected.map((item) => item.id)).toEqual([evidence[0]!.id, evidence[1]!.id, evidence[4]!.id, evidence[5]!.id]);
    expect(new Set(selected.map((item) => item.id)).size).toBe(4);
    const originalPolicy = { ...inputs.config.graph!, evidenceSelection: undefined };
    expect(selectContext('What is retrieval?', evidence.slice(0, 4), evidence.slice(4), originalPolicy)).toEqual(evidence.slice(0, 4));
    expect(() => selectContext('A very long question', [], evidence, { maxEvidence: 4, maxContextChars: 5 })).toThrow(/cap/);
  });

  it('requires the full set and three repetitions for evaluation, and records per-repetition dispersion', async () => {
    expect(StudyConfig.safeParse({ ...config, purpose: 'evaluation' }).success).toBe(false);
    expect(StudyConfig.safeParse({ ...config, experiment: { ...config.experiment, maxModelCalls: 17 } }).success).toBe(false);
    expect(ExperimentConfig.safeParse({ ...config.experiment, graph: { ...config.experiment.graph!, version: 'bounded-retrieval-1' } }).success).toBe(false);
    const repeated = { ...config, repetitions: 3 as const, experiment: { ...config.experiment, maxModelCalls: 54 } };
    const selected = loadExperimentConfig(root, repeated.experiment);
    const { records } = await runStudy(repeated, selected, { mode: 'smoke', scenario: 'demo' });
    const summary = summarizeStudy(repeated, selected, records, 'smoke');
    expect(summary.arms.every((arm) => arm.dispersion['usableResultRate']?.n === 3)).toBe(true);
    expect(summary.arms.every((arm) => arm.cells.every((cell) => cell.repetitions.length === 3))).toBe(true);
    expect(() => summarizeStudy({ ...repeated, purpose: 'evaluation' }, selected, records, 'live')).toThrow(/complete question set/);
    expect(dispersion([9, 1, 3])).toEqual({ n: 3, median: 3, min: 1, max: 9 });
    const full = StudyConfig.parse(JSON.parse(readFileSync(resolve(root, 'eval/framework/study-evaluation.json'), 'utf8')));
    expect(full.experiment.questionIds).toHaveLength(60);
    expect(full.experiment.maxModelCalls).toBe(1080);
  });

  it('writes inspectable reports and fails before creating output for invalid/live fixtures', () => {
    const output = mkdtempSync(join(tmpdir(), 'study-cli-'));
    temporary.push(output);
    const cli = resolve(root, 'packages/generation/scripts/study.ts');
    const launch = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, '--out', output, ...args], {
      encoding: 'utf8', cwd: resolve(root, 'packages/generation'), env: { ...process.env, [inputs.profile.apiKeyEnv]: '' },
    });
    const ok = launch([]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(launch(['--scenario', 'invalid-reference']).status).toBe(1);
    for (const directory of readdirSync(output)) {
      expect(readdirSync(join(output, directory)).sort()).toEqual(['fixed-inputs.json', 'inputs.json', 'records.jsonl', 'report.md', 'run.json', 'summary.json']);
      const summary = JSON.parse(readFileSync(join(output, directory, 'summary.json'), 'utf8'));
      expect(summary.actualModelRequests).toBe(0);
      expect(summary.evidenceLevel).toBe('synthetic-integration-only');
    }
    expect(launch(['--live']).status).toBe(1);
    const full = launch(['--live', '--config', 'eval/framework/study-evaluation.json']);
    expect(full.stdout).toContain('at most 1080 external model requests');
    expect(full.stderr).toContain(`${inputs.profile.apiKeyEnv} is not set`);
    expect(launch(['--live', '--scenario', 'demo']).status).toBe(1);
    expect(launch(['--scenario', 'unknown']).status).toBe(1);
    expect(readdirSync(output)).toHaveLength(2);
    const path = join(output, 'stale.json');
    writeFileSync(path, JSON.stringify({ ...config, expected: { ...config.expected, schemaSha256: 'f'.repeat(64) } }));
    expect(launch(['--config', path]).status).toBe(1);
  }, 20000);
});
