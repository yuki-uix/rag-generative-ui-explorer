/**
 * Ask the corpus one question and print a grounded Markdown answer.
 *
 * `--dry-run` builds the prompt and prints it without calling a model. That is
 * what CI runs: it exercises argument handling, retrieval, and prompt
 * construction — the parts that break silently — without spending money or
 * needing a key. A script that only ever runs on a developer's machine is a
 * gate that passes because nothing invokes it.
 */
import { resolve } from 'node:path';
import { ingest, BM25Retriever } from '@rgux/corpus';
import {
  generateAnswer,
  profileByIdOrThrow,
  systemPrompt,
  userPrompt,
} from '../src/index.js';

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value === undefined || value.startsWith('--')) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing --${name}`);
  }
  return value;
}

const dryRun = process.argv.includes('--dry-run');
const question = arg('query', 'How does sparse retrieval differ from dense retrieval?');
const profile = profileByIdOrThrow(arg('profile', 'deepseek-v4-pro'));
const k = Number(arg('k', '8'));

// Resolved from this file, not from the working directory: `pnpm --filter`
// runs with the package as cwd, so a cwd-relative path finds nothing.
const knowledgeRoot = resolve(import.meta.dirname, '../../../knowledge');
const { evidence, corpusVersion, errors } = ingest(knowledgeRoot);
if (errors.length > 0) {
  console.error('Ingestion errors:', errors.map((error) => error.message));
  process.exit(1);
}

const retriever = new BM25Retriever(evidence);
const byId = new Map(evidence.map((item) => [item.id, item]));
const retrieved = retriever
  .search(question, k)
  .map((candidate) => byId.get(candidate.evidenceId))
  .filter((item): item is NonNullable<typeof item> => item !== undefined);

console.log(`corpus:  ${corpusVersion}`);
console.log(`profile: ${profile.id}  (${profile.baseURL ?? 'anthropic default'})`);
console.log(`query:   ${question}`);
console.log(`evidence: ${retrieved.length} passage(s)\n`);

if (dryRun) {
  console.log('--- system ---');
  console.log(systemPrompt());
  console.log('\n--- user ---');
  console.log(userPrompt({ question, evidence: retrieved }));
  console.log('\n--dry-run: no model was called.');
  process.exit(0);
}

const record = await generateAnswer({
  profile,
  question,
  evidence: retrieved,
  onDelta: (text) => process.stdout.write(text),
});

console.log('\n\n--- validated ---');
if (record.answer.incomplete) {
  console.log(`incomplete: ${record.answer.reason}`);
} else {
  console.log(`citations resolved: ${record.answer.citations.length}`);
  for (const citation of record.answer.citations) {
    console.log(`  ${citation.handle} -> ${citation.evidenceId}`);
  }
  if (record.answer.rejected.length > 0) {
    console.log(`REJECTED (invented) handles: ${record.answer.rejected.join(', ')}`);
  }
  if (record.answer.uncitedSentences.length > 0) {
    console.log(`uncited sentences: ${record.answer.uncitedSentences.length}`);
    for (const sentence of record.answer.uncitedSentences) console.log(`  ${sentence}`);
  }
}

// Four figures, never one total: a cache read costs about a tenth of an
// uncached token, so a single number conflates things that differ tenfold.
console.log(
  `\nstop_reason: ${record.stopReason}  first token: ${record.firstTokenMs}ms  total: ${record.latencyMs}ms\n` +
    `usage: input ${record.usage.inputTokens}, output ${record.usage.outputTokens}, ` +
    `cache-write ${record.usage.cacheCreationInputTokens}, cache-read ${record.usage.cacheReadInputTokens}`,
);
