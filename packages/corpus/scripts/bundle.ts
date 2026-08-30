/**
 * Build the retrieval bundle the deployed app serves from.
 *
 * The Worker cannot ingest: `node:fs` is an empty virtual filesystem in
 * workerd. So the chunks are cut into a committed artifact at build time, the
 * same reason `embeddings/` exists, and the app imports it.
 *
 * **Lexical only, deliberately and visibly.** Dense retrieval needs the query
 * embedded at request time, and that runs onnxruntime — a native Node addon
 * that does not exist in workerd. The evaluation measures dense retrieval at
 * 65.9% recall; the deployed app serves BM25 at 48.9%. That divergence is real
 * and is recorded in the bundle so nothing downstream can report a number the
 * served system does not produce.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ingest } from '../src/ingest.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  console.error('Ingestion errors:', errors.map((error) => error.message));
  process.exit(1);
}

const bundle = {
  corpusVersion,
  /** What the served system can actually do, not what the harness measures. */
  retrieval: 'lexical-bm25',
  builtAt: new Date().toISOString().slice(0, 10),
  evidence,
};

const out = resolve(repoRoot, 'apps/web/fixtures/retrieval-bundle.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(bundle)}\n`);

console.error(
  `wrote ${evidence.length} chunks (${(JSON.stringify(bundle).length / 1024).toFixed(0)} KB) ` +
    `for ${corpusVersion} to ${out}`,
);
