import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAuditRecords } from '../src/experiment/audit-records.js';
import { PriceSnapshot, costStudy, BalanceObservation, reconcileBalance } from '../src/experiment/cost.js';
import { SemanticReview, reviewInventory, summarizeSemanticReview } from '../src/experiment/semantic-review.js';
import { sha256, loadExperimentConfig } from '../src/experiment/inputs.js';
import { StudyConfig, validateStudy } from '../src/experiment/study.js';
import { z } from 'zod';

// Entirely offline: analyze saved observations; never repeat a provider call.
const root = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const values = new Map<string, string>();
try {
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!, value = args[i + 1];
    if (!['--run', '--out', '--review', '--prices', '--billing'].includes(flag) || values.has(flag) || !value || value.startsWith('--')) throw new Error(`Unknown, repeated or missing argument: ${flag}`);
    values.set(flag, value);
  }
  if (!values.has('--run') || !values.has('--out')) throw new Error('--run and --out are required.');
  const run = resolve(root, values.get('--run')!);
  const source = readFileSync(resolve(run, 'records.jsonl'), 'utf8');
  const records = parseAuditRecords(source.trim().split('\n').map((line) => JSON.parse(line)));
  const recordsSha256 = sha256(source);
  const manifestSource = readFileSync(resolve(run, 'run.json'), 'utf8');
  const manifest = JSON.parse(manifestSource) as { mode?: string; fixtureVersion?: unknown; config?: unknown; pins?: { corpus?: { indexSha256?: string } } };
  if (manifest.mode !== 'live' || manifest.fixtureVersion !== null) throw new Error('This audit command requires original live artifacts.');
  const config = StudyConfig.parse(manifest.config);
  const inputs = loadExperimentConfig(root, config.experiment);
  validateStudy(config, inputs);
  if (manifest.pins?.corpus?.indexSha256 !== inputs.pins.corpus.indexSha256) throw new Error('Pinned corpus content changed.');
  const summarySource = readFileSync(resolve(run, 'summary.json'), 'utf8');
  const summary = z.object({ mode: z.literal('live'), questionCount: z.number().int().positive(), repetitions: z.number().int().positive(),
    actualModelRequests: z.number().int().nonnegative(), adapterRequests: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }).parse(JSON.parse(summarySource));
  const rowKeys = records.map((record) => `${record.repetition}/${record.observed.question.id}/${record.arm}`);
  if (records.length !== config.repetitions * config.experiment.questionIds.length * 3 || new Set(rowKeys).size !== records.length
    || summary.questionCount !== config.experiment.questionIds.length || summary.repetitions !== config.repetitions
    || records.some((record) => record.repetition > config.repetitions || !config.experiment.questionIds.includes(record.observed.question.id))) throw new Error('Incomplete or mismatched live study.');
  for (const record of records) {
    const question = inputs.questions.find((question) => question.id === record.observed.question.id);
    if (JSON.stringify(question) !== JSON.stringify(record.observed.question)) throw new Error('Question content drifted.');
    for (const item of record.observed.evidence) {
      const source = inputs.evidenceById.get(item.id);
      if (!source || source.text !== item.text || source.documentTitle !== item.documentTitle) throw new Error('Saved evidence differs from the pinned corpus.');
    }
  }
  const priceSource = readFileSync(resolve(root, values.get('--prices') ?? 'eval/framework/pricing/deepseek-v4-pro-2026-10-21.json'), 'utf8');
  const price = PriceSnapshot.parse(JSON.parse(priceSource));
  const cost = costStudy(records, price, 'live');
  if (cost.calls.length !== summary.actualModelRequests || cost.calls.length !== summary.adapterRequests
    || summary.failed !== records.filter((record) => record.observed.result === null).length) throw new Error('Saved summary and actual calls disagree.');
  const inventory = reviewInventory(records);
  let semantic: ReturnType<typeof summarizeSemanticReview> | null = null;
  let reviewSha256: string | null = null;
  if (values.has('--review')) {
    const reviewSource = readFileSync(resolve(root, values.get('--review')!), 'utf8');
    reviewSha256 = sha256(reviewSource);
    semantic = summarizeSemanticReview(records, SemanticReview.parse(JSON.parse(reviewSource)), recordsSha256);
  }
  let billing: ReturnType<typeof reconcileBalance> | null = null;
  let billingSha256: string | null = null;
  if (values.has('--billing')) {
    const billingSource = readFileSync(resolve(root, values.get('--billing')!), 'utf8');
    billingSha256 = sha256(billingSource);
    billing = reconcileBalance(cost, BalanceObservation.parse(JSON.parse(billingSource)), recordsSha256);
  }
  const output = resolve(root, values.get('--out')!);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'review-inventory.json'), JSON.stringify({ recordsSha256, fields: inventory }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(resolve(output, 'audit.json'), JSON.stringify({
    version: 'framework-study-audit-1', recordsSha256, manifestSha256: sha256(manifestSource), summarySha256: sha256(summarySource), priceSha256: sha256(priceSource), reviewSha256, billingSha256,
    cost, semantic, billing,
  }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(resolve(output, 'audit.md'), [
    '# Live study: semantic and cost audit', '',
    `Records: ${records.length}; rendered factual fields: ${inventory.length}; model requests: ${cost.calls.length}.`, '',
    '| Arm | Requests | Published-rate CNY cost | Published-rate USD cost |',
    '| --- | ---: | ---: | ---: |',
    ...cost.arms.map((arm) => `| ${arm.arm} | ${arm.requests} | ${arm.totals['CNY']?.amount ?? 'unresolved'} | ${arm.totals['USD']?.amount ?? 'unresolved'} |`), '',
    `Actual-usage rated totals: CNY ${cost.totals['CNY']?.amount ?? 'unresolved'}; USD ${cost.totals['USD']?.amount ?? 'unresolved'}. These are separate published currency schedules, not FX conversion.`,
    billing ? `Observed account deduction: ${billing.currency} ${billing.amount}; balance resolution ${billing.resolution}; within resolution of rated total: ${billing.consistentWithinReportedPrecision}; two latest readings equal: ${billing.twoLatestObservationsEqual}.` : 'No account balance observation supplied.',
    'Account balance change is account-wide, can settle with delay, and is not a per-request invoice. Full balances and credentials are not included.', '',
    semantic ? `Reviewed fields: ${semantic.reviewedFields}; citation links: ${semantic.reviewedCitations}; fully supported: ${semantic.verdicts['supported']}; partial: ${semantic.verdicts['partial']}; unsupported: ${semantic.verdicts['unsupported']}; contradicted: ${semantic.verdicts['contradicted']}.` : 'Semantic review pending.',
    semantic ? `Strict citation precision: ${semantic.citationPrecision}; unsupported-claim rate: ${semantic.unsupportedClaimRate}; not-fully-supported rate: ${semantic.notFullySupportedRate}. Partial links do not count as full support. Empty denominators remain null.` : '',
    semantic ? 'Single non-blinded AI evidence audit, not an independent human evaluation. The reviewer also built the harness; the exploratory rubric was finalized during the pilot and the exact judge model was not independently pinned.' : '',
    'Only validated, renderable GroundedText fields enter semantic rates. Failed generations still enter spend, but their raw unrendered claims do not enter rendered-field precision. Scope qualifications and overall answer decisions are audited separately.',
    'See semantic-review.json for each claim, exact source excerpt and rationale, and audit.json for every priced control/generation call. Corpus support does not establish the corpus itself is correct.', '',
  ].join('\n'), { flag: 'wx' });
  console.log(JSON.stringify({ records: records.length, fields: inventory.length, cost: cost.totals, semanticReviewed: semantic !== null, output }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Audit failed.'); process.exitCode = 1;
}
