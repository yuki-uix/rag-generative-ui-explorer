/**
 * Searches the ingested index with BM25.
 *
 * Builds the in-process index from knowledge/ at startup — no database — and
 * prints the ranked candidates for a query, one per line, with the chunk text
 * so a result can be read rather than just trusted. A failed ingestion exits
 * non-zero rather than serving a partial index.
 *
 * usage: retriever:search --query <text> [--k N]
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingest } from '../src/ingest.js';
import { BM25Retriever } from '../src/bm25.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function usage(): never {
  console.error('usage: retriever:search --query <text> [--k N]');
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) usage();
  return value;
}

const query = argValue('--query');
if (query === undefined) usage();
const k = Number(argValue('--k') ?? 10);
if (!Number.isInteger(k) || k < 1) usage();

const { evidence, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  for (const error of errors) console.error(error.message);
  process.exit(1);
}

const byId = new Map(evidence.map((entry) => [entry.id, entry]));
const retriever = new BM25Retriever(evidence);

for (const [rank, candidate] of retriever.search(query, k).entries()) {
  const entry = byId.get(candidate.evidenceId)!;
  console.log(
    `${rank + 1}\t${candidate.score.toFixed(4)}\t${candidate.evidenceId}\t${entry.text.replace(/\s+/g, ' ').slice(0, 120)}`,
  );
}
