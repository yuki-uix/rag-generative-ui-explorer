/**
 * One command, one report over the labelled question set.
 *
 * `--repetitions 0` (the default) computes retrieval metrics only. Those are
 * mechanical while no model sits in the pipeline, so they cost nothing and run
 * in CI. Anything above zero calls a model once per question per repetition and
 * spends real money; the script prints what it is about to spend and requires
 * `--yes` before doing it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BM25Retriever, ingest, parseEvalSet } from '@rgux/corpus';
import { profileByIdOrThrow, runMetrics } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value === undefined || value.startsWith('--') ? fallback : value;
}

const repoRoot = resolve(import.meta.dirname, '../../..');
const repetitions = Number(arg('repetitions', '0'));
const k = Number(arg('k', '10'));
// Measured, not guessed: a five-question pilot at 700 truncated three of five
// responses, because the reasoning this endpoint does before writing is billed
// against the same budget. Two of those five never emitted a visible token at
// all — they were cut off inside their reasoning.
const maxTokens = Number(arg('max-tokens', '4096'));
const profile = profileByIdOrThrow(arg('profile', 'deepseek-v4-pro'));

const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  console.error('Ingestion errors:', errors.map((error) => error.message));
  process.exit(1);
}

const { set, problems } = parseEvalSet(readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'));
if (!set || problems.length > 0) {
  console.error('Question set problems:', problems);
  process.exit(1);
}

// The eval set records the corpus it was labelled against. Scoring against a
// different one would produce numbers that look fine and mean nothing.
if (set.header.corpusVersion !== corpusVersion) {
  console.error(
    `Corpus drift: questions were labelled against ${set.header.corpusVersion}, ingest produced ${corpusVersion}.`,
  );
  process.exit(1);
}

if (repetitions > 0 && !process.argv.includes('--yes')) {
  const calls = repetitions * set.questions.length;
  console.error(
    `${calls} model calls (${set.questions.length} questions x ${repetitions} repetitions) on ${profile.id}.\n` +
      'This spends money. Re-run with --yes to proceed.',
  );
  process.exit(1);
}

const report = await runMetrics({
  retriever: new BM25Retriever(evidence),
  evidenceById: new Map(evidence.map((item) => [item.id, item])),
  questions: set.questions,
  header: {
    profileId: profile.id,
    model: profile.model,
    endpoint: profile.baseURL ?? 'anthropic default',
    promptVersion: 'set by the harness',
    corpusVersion,
    chunking: set.header.chunking,
    questionSet: { count: set.questions.length, labelledOn: set.header.labelledOn },
    k,
    repetitions,
    maxTokens,
  },
  repetitions,
  profile,
  maxTokens,
  onProgress: (done, total) => process.stderr.write(`\r${done}/${total}`),
});

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

console.log('\n=== run ===');
for (const [key, value] of Object.entries(report.header)) {
  console.log(`  ${key.padEnd(16)} ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

console.log('\n=== retrieval (mechanical: no model in this pipeline) ===');
const r = report.retrieval;
console.log(`  questions scored  ${r.questions}`);
console.log(`  mean Recall@${r.k}    ${pct(r.meanRecall)}`);
console.log(`  any-hit rate      ${pct(r.anyHitRate)}`);
console.log(`  MRR               ${r.mrr.toFixed(3)}`);
console.log(`  nDCG@${r.k}          ${r.ndcg.toFixed(3)}`);
console.log(`  zero-hit          ${r.zeroHitQuestionIds.length}: ${r.zeroHitQuestionIds.join(', ')}`);

if (!report.grounding) {
  console.log('\nNo model was called. Pass --repetitions N --yes for grounding metrics.');
  process.exit(0);
}

// Median and full range, never a bare mean: with few repetitions a mean hides a
// bimodal split, which is the shape a disagreement between runs takes.
// `n` is repetitions; `from` is how many attempts fed the number. A rate over
// two comparable answers must not print like a rate over sixty.
const show = (
  name: string,
  d: { median: number; min: number; max: number; n: number; scoredAttempts: number },
  format = pct,
) =>
  console.log(
    `  ${name.padEnd(26)} median ${format(d.median)}  range ${format(d.min)}\u2013${format(d.max)}` +
      `  n=${d.n} rep, from ${d.scoredAttempts} attempt(s)`,
  );

console.log('\n=== grounding (model-dependent: median and range, n = repetitions) ===');
show('citation precision', report.grounding.citationPrecision);
show('citation completeness', report.grounding.citationCompleteness);
show('answer rate', report.grounding.answerRate);
show('insufficient accuracy', report.grounding.insufficientAccuracy);
show('first visible token (ms)', report.grounding.firstTokenMs, (v) => `${Math.round(v)}`);

if (report.grounding.incomparable.length > 0) {
  console.log(`\n  not pooled (stop_reason != end_turn): ${report.grounding.incomparable.length}`);
  for (const item of report.grounding.incomparable) {
    console.log(`    ${item.questionId}: ${item.stopReason}`);
  }
}

const s = report.spend!;
console.log('\n=== spend (four figures, never one total) ===');
console.log(`  calls ${s.calls}  input ${s.inputTokens}  output ${s.outputTokens}`);
console.log(`  cache-write ${s.cacheCreationInputTokens}  cache-read ${s.cacheReadInputTokens}`);
console.log(`  responses carrying hidden reasoning: ${s.responsesWithHiddenReasoning}/${s.calls}`);
