import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { expect, it } from 'vitest';

it('reproduces the saved live semantic/cost audit offline and refuses a smoke run', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const output = mkdtempSync(join(tmpdir(), 'audit-cli-'));
  const run = 'eval/framework/results/f5-live-pilot-2026-10-21';
  const launch = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', resolve(root, 'packages/generation/scripts/review-study.ts'), ...args], {
    cwd: resolve(root, 'packages/generation'), encoding: 'utf8', env: { ...process.env, DEEPSEEK_API_KEY: '' },
  });
  try {
    const result = launch(['--run', run, '--review', `${run}/semantic-review.json`, '--billing', `${run}/billing-observation.json`, '--out', output]);
    expect(result.status, result.stderr).toBe(0);
    const audit = JSON.parse(readFileSync(join(output, 'audit.json'), 'utf8'));
    expect(audit.cost.calls).toHaveLength(44);
    expect(audit.cost.totals.CNY.amount).toBe('0.939340500');
    expect(audit.semantic).toMatchObject({ reviewedFields: 41, verdicts: { supported: 31, partial: 10 } });
    expect(audit.billing).toMatchObject({ amount: '0.940000000', consistentWithinReportedPrecision: true, twoLatestObservationsEqual: true });
    expect(readFileSync(join(output, 'audit.md'), 'utf8')).toContain('Single non-blinded AI');
    expect(launch(['--run', 'eval/framework/results/f5-pilot-2026-10-21', '--out', join(output, 'smoke')]).status).toBe(1);
  } finally { rmSync(output, { recursive: true, force: true }); }
}, 20000);
