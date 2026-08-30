/**
 * Ask the planner for a card set and print what came back, unvalidated.
 *
 * Unvalidated on purpose: this script's job is to show what the model actually
 * produced, and validation is #24. Printing a repaired or filtered version here
 * would hide the thing the exit criterion measures.
 *
 * `--dry-run` builds the prompts and prints them without calling a model.
 */
import { resolve } from 'node:path';
import { BM25Retriever, ingest } from '@rgux/corpus';
import {
  schemaBelongsInPrompt,
  plannerSystemPrompt,
  plannerUserPrompt,
  planCards,
  profileByIdOrThrow,
  plannerSchema,
} from '../src/index.js';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value === undefined || value.startsWith('--') ? fallback : value;
}

const repoRoot = resolve(import.meta.dirname, '../../..');
const dryRun = process.argv.includes('--dry-run');
const question = arg('query', 'How does sparse retrieval differ from dense retrieval?');
const profile = profileByIdOrThrow(arg('profile', 'deepseek-v4-pro'));
const k = Number(arg('k', '8'));

const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  console.error('Ingestion errors:', errors.map((e) => e.message));
  process.exit(1);
}

const byId = new Map(evidence.map((item) => [item.id, item]));
const retriever = new BM25Retriever(evidence);

// `--irrelevant` hands the planner passages that cannot answer the question, to
// see whether it returns no cards or invents some. That is the behaviour #23
// asks about and it can only be observed against a real model.
const retrieved = process.argv.includes('--irrelevant')
  ? (await retriever.search('accessibility keyboard focus screen reader', k))
      .map((c) => byId.get(c.evidenceId))
      .filter((x): x is NonNullable<typeof x> => x !== undefined)
  : (await retriever.search(question, k))
      .map((c) => byId.get(c.evidenceId))
      .filter((x): x is NonNullable<typeof x> => x !== undefined);

console.log(`corpus ${corpusVersion}  profile ${profile.id}  schema enforced: ${profile.enforcesOutputSchema}`);
console.log(`query: ${question}`);
console.log(`evidence: ${retrieved.length} passage(s)${process.argv.includes('--irrelevant') ? ' (deliberately irrelevant)' : ''}\n`);

if (dryRun) {
  const s = plannerSchema(repoRoot);
  console.log('--- system ---\n' + plannerSystemPrompt(schemaBelongsInPrompt(profile) ? s : undefined));
  console.log('\n--- user ---\n' + plannerUserPrompt(question, retrieved));
  console.log('\n--dry-run: no model was called.');
  process.exit(0);
}

const record = await planCards({
  profile,
  question,
  evidence: retrieved,
  schema: plannerSchema(repoRoot),
  maxTokens: Number(arg('max-tokens', '16000')),
});

console.log('--- raw completion (unvalidated) ---');
console.log(record.raw);
console.log(
  `\nprompt ${record.promptVersion}  schemaEnforced ${record.schemaEnforced}  stop ${record.stopReason}  ${record.latencyMs}ms\n` +
    `usage input ${record.usage.inputTokens} output ${record.usage.outputTokens} cache-read ${record.usage.cacheReadInputTokens}`,
);
