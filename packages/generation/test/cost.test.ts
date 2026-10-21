import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PriceSnapshot, costStudy, tariffAt, tariffForInterval, reconcileBalance, type BalanceObservation } from '../src/experiment/cost.js';
import type { StudyRecord } from '../src/experiment/study.js';

const root = resolve(import.meta.dirname, '../../..');
const price = PriceSnapshot.parse(JSON.parse(readFileSync(resolve(root, 'eval/framework/pricing/deepseek-v4-pro-2026-10-21.json'), 'utf8')));
const prototype = JSON.parse(readFileSync(resolve(root, 'eval/framework/results/f5-pilot-2026-10-21/records.jsonl'), 'utf8').split('\n')[0]!) as StudyRecord;
function sample() {
  const record = structuredClone(prototype);
  if ('calls' in record.observed) throw new Error('Native fixture required');
  record.startedAt = '2026-10-21T04:30:00Z'; record.completedAt = '2026-10-21T04:30:02Z';
  record.observed.requests[0]!.startedAt = record.startedAt;
  record.observed.attempts = [{ ...record.observed.attempts[0]!, model: price.model, usage: {
    inputTokens: 1000000, cacheReadInputTokens: 1000000, cacheCreationInputTokens: 0, outputTokens: 1000000,
  } }];
  return record;
}

describe('actual usage pricing', () => {
  it('prices cache misses, cache hits and output separately with exact decimal arithmetic', () => {
    const result = costStudy([sample()], price, 'live');
    expect(result.totals['CNY']).toMatchObject({ amount: '18.150000000', unresolvedCalls: 0 });
    expect(result.totals['USD']).toMatchObject({ amount: '2.662000000', unresolvedCalls: 0 });
    expect(result.calls[0]!.tariff).toBe('offPeak');
    const peak = sample(); peak.completedAt = '2026-10-21T02:00:02Z';
    if (!('calls' in peak.observed)) peak.observed.requests[0]!.startedAt = '2026-10-21T02:00:00Z';
    expect(costStudy([peak], price, 'live').totals['CNY']!.amount).toBe('36.300000000');
  });

  it('leaves missing usage, unknown creation rates, model mismatch and missing timing unresolved', () => {
    for (const change of [
      (r: StudyRecord) => { if (!('calls' in r.observed)) r.observed.attempts = []; },
      (r: StudyRecord) => { if (!('calls' in r.observed)) r.observed.attempts = [{ ...r.observed.attempts[0]!, usage: { ...r.observed.attempts[0]!.usage, cacheCreationInputTokens: 1 } }]; },
      (r: StudyRecord) => { if (!('calls' in r.observed)) (r.observed.requests[0]!.body as Record<string, unknown>)['model'] = 'other'; },
      (r: StudyRecord) => { delete r.completedAt; },
    ]) {
      const record = sample(); change(record);
      const cost = costStudy([record], price, 'live');
      expect(cost.totals['CNY']!.amount).toBeNull();
      expect(cost.totals['CNY']!.unresolvedCalls).toBe(1);
      expect(cost.calls[0]!.unresolvedReason).not.toBeNull();
    }
  });

  it('rejects pricing smoke data, including a falsely relabelled smoke invocation', () => {
    expect(() => costStudy([sample()], price, 'smoke')).toThrow(/Synthetic/);
    expect(() => costStudy([prototype], price, 'live')).toThrow(/Synthetic/);
  });

  it('respects boundaries and rejects even an interval whose endpoints share a tariff but cross a peak', () => {
    expect(tariffAt('2026-10-21T03:59:59Z', price)).toBe('peak');
    expect(tariffAt('2026-10-21T04:00:00Z', price)).toBe('offPeak');
    expect(tariffAt('2026-10-22T04:00:00Z', price)).toBeNull();
    expect(tariffForInterval('2026-10-21T04:59:00Z', '2026-10-21T11:00:00Z', price)).toBeNull();
    expect(tariffForInterval('2026-10-21T04:59:00Z', '2026-10-21T05:00:00Z', price)).toBe('offPeak');
    expect(tariffForInterval('2026-10-21T06:00:00Z', '2026-10-21T05:00:00Z', price)).toBeNull();
  });

  it('keeps balance rounding and delayed settlement separate from usage-rated spend', () => {
    const cost = costStudy([sample()], price, 'live');
    const observation: BalanceObservation = {
      version: 'framework-balance-observation-1', recordsSha256: 'a'.repeat(64), sourceEndpoint: 'https://api.deepseek.com/user/balance', currency: 'CNY',
      windowStartedAt: '2026-10-21T04:29:00Z', rawBalanceTotalsPublished: false, otherAccountActivity: 'not-independently-excluded',
      observations: [
        { at: '2026-10-21T04:31:00Z', deductionAmount: '10.000000000', reportedDecimalPlaces: 2 },
        { at: '2026-10-21T04:35:00Z', deductionAmount: '18.150000000', reportedDecimalPlaces: 2 },
        { at: '2026-10-21T04:36:00Z', deductionAmount: '18.150000000', reportedDecimalPlaces: 2 },
      ],
    };
    expect(reconcileBalance(cost, observation, 'a'.repeat(64))).toMatchObject({ amount: '18.150000000', consistentWithinReportedPrecision: true, twoLatestObservationsEqual: true });
    const mismatched = structuredClone(observation); mismatched.observations.at(-1)!.deductionAmount = '18.100000000';
    expect(reconcileBalance(cost, mismatched, 'a'.repeat(64))).toMatchObject({ difference: '-0.050000000', consistentWithinReportedPrecision: false, twoLatestObservationsEqual: false });
    expect(() => reconcileBalance(cost, observation, 'b'.repeat(64))).toThrow(/different records/);
  });
});
