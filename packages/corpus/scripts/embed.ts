/**
 * Build the embedding index offline, at corpus build time.
 *
 * Written to `knowledge/embeddings/<model>.json` and committed, so retrieval
 * and evaluation never depend on a model download at request time. The file
 * records the model, its revision, and the corpus version it was built from:
 * vectors from two models are not comparable, and a stale file would otherwise
 * resolve cleanly against a corpus it no longer matches.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ingest } from '../src/ingest.js';
import { embed, embeddingModelByIdOrThrow, indexVersion } from '../src/embedding.js';
import type { EmbeddingIndex } from '../src/dense.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const idIndex = process.argv.indexOf('--model');
const model = embeddingModelByIdOrThrow(
  idIndex >= 0 ? process.argv[idIndex + 1]! : 'Xenova/all-MiniLM-L6-v2',
);

const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  console.error('Ingestion errors:', errors.map((error) => error.message));
  process.exit(1);
}

console.error(`embedding ${evidence.length} chunks with ${model.id}@${model.revision}`);
const started = Date.now();

// Passages carry no query prefix: the asymmetry is the point of having one.
const vectors = await embed(evidence.map((item) => item.text), model);
if (vectors.length !== evidence.length) {
  console.error(`Expected ${evidence.length} vectors, got ${vectors.length}`);
  process.exit(1);
}
for (const [index, vector] of vectors.entries()) {
  if (vector.length !== model.dimensions) {
    console.error(
      `Vector ${index} has ${vector.length} dimensions, model declares ${model.dimensions}.`,
    );
    process.exit(1);
  }
}

const index: EmbeddingIndex = {
  indexVersion: indexVersion(corpusVersion, model),
  corpusVersion,
  model: { id: model.id, revision: model.revision, dimensions: model.dimensions },
  vectors: evidence.map((item, position) => ({
    evidenceId: item.id,
    // Rounded so the artifact is diffable and stable across platforms. Six
    // decimals is far below the resolution at which ranking changes; the
    // alternative is a file that churns on floating-point noise.
    vector: vectors[position]!.map((value) => Number(value.toFixed(6))),
  })),
};

const out = resolve(repoRoot, 'knowledge/embeddings', `${model.id.replace('/', '_')}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(index, null, 0)}\n`);

console.error(
  `wrote ${index.vectors.length} vectors to ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s\n` +
    `indexVersion ${index.indexVersion}  corpusVersion ${corpusVersion}`,
);
