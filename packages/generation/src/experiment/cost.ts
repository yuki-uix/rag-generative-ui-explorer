import { z } from 'zod';
import type { PlanRecord } from '../planner/plan.js';
import type { AuditRecord } from './audit-records.js';
import type { RequestRecord } from './transport.js';

const DecimalRate = z.string().regex(/^\d+(\.\d{1,3})?$/);
const Rates = z.strictObject({ cacheMiss: DecimalRate, cacheHit: DecimalRate, output: DecimalRate });
export const PriceSnapshot = z.strictObject({
  version: z.string().min(1), model: z.string().min(1), publishedModelVersion: z.string().min(1),
  verifiedOn: z.iso.date(), sources: z.strictObject({ USD: z.url(), CNY: z.url() }),
  unit: z.literal('currency per 1000000 tokens'),
  peakWindowsUTC: z.array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)])),
  peakWeekdaysUTC: z.array(z.number().int().min(0).max(6)),
  verifiedChinesePublicHolidayDates: z.record(z.string(), z.boolean()),
  rates: z.strictObject({ CNY: z.strictObject({ offPeak: Rates, peak: Rates }), USD: z.strictObject({ offPeak: Rates, peak: Rates }) }),
  cacheCreationPolicy: z.string(), boundaryPolicy: z.string(),
});
export type PriceSnapshot = z.infer<typeof PriceSnapshot>;

/** Require an explicit holiday classification; never guess a future price. */
export function tariffAt(timestamp: string, price: PriceSnapshot): 'offPeak' | 'peak' | null {
  const time = new Date(timestamp);
  if (!Number.isFinite(time.getTime())) return null;
  const day = new Date(time.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!(day in price.verifiedChinesePublicHolidayDates)) return null;
  if (price.verifiedChinesePublicHolidayDates[day] || !price.peakWeekdaysUTC.includes(time.getUTCDay())) return 'offPeak';
  const minutes = time.getUTCHours() * 60 + time.getUTCMinutes();
  const value = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h! * 60 + m!; };
  return price.peakWindowsUTC.some(([start, end]) => minutes >= value(start) && minutes < value(end)) ? 'peak' : 'offPeak';
}

export function tariffForInterval(startedAt: string, completedAt: string, price: PriceSnapshot) {
  const start = Date.parse(startedAt), end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 86400000) return null;
  const tariff = tariffAt(startedAt, price);
  if (tariff === null || tariffAt(completedAt, price) !== tariff) return null;
  for (let time = Math.floor(start / 60000) * 60000 + 60000; time < end; time += 60000) {
    if (tariffAt(new Date(time).toISOString(), price) !== tariff) return null;
  }
  return tariff;
}

// Rates have at most three decimal places, so rate/1M is an integer number of
// nanocurrency units per token. No floating-point accounting or FX conversion.
const nanosPerToken = (rate: string) => {
  const [integer, fractional = ''] = rate.split('.');
  return BigInt(integer!) * 1000n + BigInt(fractional.padEnd(3, '0'));
};
export const decimalFromNanos = (value: bigint) => `${value / 1000000000n}.${(value % 1000000000n).toString().padStart(9, '0')}`;

export function costStudy(records: readonly AuditRecord[], price: PriceSnapshot, mode: 'smoke' | 'live') {
  PriceSnapshot.parse(price);
  if (mode !== 'live') throw new Error('Synthetic token usage cannot be priced as real spend.');
  if (records.some((record) => {
    const observed = record.observed;
    return 'calls' in observed ? observed.calls.some((call) => call.plan?.model === 'offline-fixture') : observed.attempts.some((plan) => plan.model === 'offline-fixture');
  })) throw new Error('Synthetic model responses cannot be priced as real spend.');
  const calls = records.flatMap((record) => {
    const observed = record.observed;
    const groups: { kind: string; plan: PlanRecord | null; requests: RequestRecord[] }[] = 'calls' in observed ? observed.calls
      : [{ kind: 'generation', plan: observed.attempts[0] ?? null, requests: observed.requests }];
    return groups.flatMap((call, index) => call.requests.map((request, attempt) => {
      const body = request.body as { model?: string } | null;
      const tariff = request.startedAt && record.completedAt ? tariffForInterval(request.startedAt, record.completedAt, price) : null;
      const usage = call.plan?.usage;
      const known = usage && (['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens'] as const).every((key) => Number.isSafeInteger(usage[key]) && usage[key]! >= 0);
      const reason = body?.model !== price.model ? 'model-mismatch'
        : new URL(request.url).origin !== 'https://api.deepseek.com' || !new URL(request.url).pathname.startsWith('/anthropic/') ? 'endpoint-mismatch'
        : call.requests.length !== 1 || attempt !== 0 ? 'usage-not-attributable-to-attempt'
        : !request.startedAt || !record.completedAt || Date.parse(request.startedAt) > Date.parse(record.completedAt) ? 'missing-or-invalid-time'
        : tariff === null ? 'unverified-or-crossing-tariff-window'
        : !known ? 'usage-unavailable'
        : usage.cacheCreationInputTokens !== 0 ? 'unpriced-cache-creation'
        : null;
      const costs = Object.fromEntries((['CNY', 'USD'] as const).map((currency) => {
        if (reason) return [currency, null];
        const rates = price.rates[currency][tariff!];
        const nanos = BigInt(usage!.inputTokens!) * nanosPerToken(rates.cacheMiss)
          + BigInt(usage!.cacheReadInputTokens!) * nanosPerToken(rates.cacheHit)
          + BigInt(usage!.outputTokens!) * nanosPerToken(rates.output);
        return [currency, { nanos: nanos.toString(), amount: decimalFromNanos(nanos) }];
      }));
      return {
        recordKey: `${record.repetition}/${observed.question.id}/${record.arm}`,
        arm: record.arm, kind: call.kind, callIndex: index, attemptIndex: attempt,
        startedAt: request.startedAt ?? null, armCompletedAt: record.completedAt ?? null,
        httpStatus: request.status, tariff, usage: usage ?? null, unresolvedReason: reason, costs,
      };
    }));
  });
  const totals = (selected: typeof calls) => Object.fromEntries((['CNY', 'USD'] as const).map((currency) => {
    const known = selected.reduce((sum, call) => sum + BigInt(call.costs[currency]?.nanos ?? '0'), 0n);
    return [currency, {
      amount: selected.every((call) => call.costs[currency] !== null) ? decimalFromNanos(known) : null,
      knownAmount: decimalFromNanos(known), unresolvedCalls: selected.filter((call) => call.costs[currency] === null).length,
    }];
  }));
  const stats = (values: (string | null)[]) => {
    const sorted = values.filter((value) => value !== null).map((value) => BigInt(value.replace('.', ''))).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    if (!sorted.length) return null;
    const center = Math.floor(sorted.length / 2);
    return { n: sorted.length, min: decimalFromNanos(sorted[0]!), max: decimalFromNanos(sorted.at(-1)!),
      median: decimalFromNanos(sorted.length % 2 ? sorted[center]! : (sorted[center - 1]! + sorted[center]!) / 2n) };
  };
  return {
    version: 'framework-cost-report-1', priceVersion: price.version, calculation: 'actual-provider-usage-times-published-rates',
    accountInvoice: false, calls, totals: totals(calls),
    arms: ['native', 'langchain', 'langgraph'].map((arm) => {
      const selected = calls.filter((call) => call.arm === arm);
      const repetitions = [...new Set(records.map((record) => record.repetition))].sort().map((repetition) => ({
        repetition, totals: totals(selected.filter((call) => call.recordKey.startsWith(`${repetition}/`))),
      }));
      return { arm, requests: selected.length, totals: totals(selected), repetitions,
        dispersion: Object.fromEntries((['CNY', 'USD'] as const).map((currency) => [currency, stats(repetitions.map((row) => row.totals[currency]?.amount ?? null))])),
      };
    }),
  };
}

export const BalanceObservation = z.strictObject({
  version: z.literal('framework-balance-observation-1'), recordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceEndpoint: z.literal('https://api.deepseek.com/user/balance'), currency: z.enum(['CNY', 'USD']),
  windowStartedAt: z.iso.datetime(),
  observations: z.array(z.strictObject({ at: z.iso.datetime(), deductionAmount: z.string().regex(/^\d+\.\d{9}$/), reportedDecimalPlaces: z.number().int().min(0).max(9) })).min(1),
  rawBalanceTotalsPublished: z.literal(false), otherAccountActivity: z.literal('not-independently-excluded'),
});
export type BalanceObservation = z.infer<typeof BalanceObservation>;

export function reconcileBalance(cost: ReturnType<typeof costStudy>, observation: BalanceObservation, recordsSha256: string) {
  BalanceObservation.parse(observation);
  if (observation.recordsSha256 !== recordsSha256) throw new Error('Balance observation belongs to different records.');
  const points = observation.observations;
  if (points.some((point, index) => Date.parse(point.at) < Date.parse(observation.windowStartedAt)
    || (index > 0 && Date.parse(point.at) <= Date.parse(points[index - 1]!.at)))) throw new Error('Balance observations must be chronological.');
  const latest = points.at(-1)!;
  const toNanos = (decimal: string) => BigInt(decimal.replace('.', ''));
  const expected = cost.totals[observation.currency]?.amount;
  const difference = expected === null || expected === undefined ? null : toNanos(latest.deductionAmount) - toNanos(expected);
  const absolute = difference === null ? null : difference < 0n ? -difference : difference;
  const quantum = 10n ** BigInt(9 - latest.reportedDecimalPlaces);
  return {
    method: 'observed-account-balance-delta', currency: observation.currency,
    amount: latest.deductionAmount, resolution: decimalFromNanos(quantum), observedAt: latest.at,
    ratedAmount: expected ?? null,
    difference: difference === null ? null : `${difference < 0n ? '-' : ''}${decimalFromNanos(absolute!)}`,
    consistentWithinReportedPrecision: absolute === null ? null : absolute <= quantum,
    twoLatestObservationsEqual: points.length >= 2 && latest.deductionAmount === points.at(-2)!.deductionAmount,
    attribution: 'Account-wide change over the measured window; concurrent activity was not independently excluded. Raw balances are private. This is not a per-request invoice.',
    observations: points,
  };
}
