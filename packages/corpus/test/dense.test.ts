/**
 * Dense retrieval and fusion. Deterministic parts only: the vectors are fixed
 * by hand so the arithmetic is checkable, and the real index is checked for the
 * properties that would make a run meaningless rather than for its numbers.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DenseRetriever, type EmbeddingIndex } from '../src/dense.js';
import { FusionRetriever, FUSION_POOL, RRF_K } from '../src/fusion.js';
import { MINILM, embeddingModelByIdOrThrow, indexVersion } from '../src/embedding.js';
import { ingest } from '../src/ingest.js';
import type { Candidate, Retriever } from '../src/retriever.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function stub(ids: readonly string[]): Retriever {
  return {
    async search(_query, k) {
      return ids.slice(0, k).map((evidenceId, index) => ({ evidenceId, score: 100 - index }));
    },
  };
}

describe('fusion', () => {
  /**
   * RRF by hand. With k=60: rank 1 contributes 1/61, rank 2 gives 1/62, rank 3
   * gives 1/63.
   *
   * A: 1/61 + 1/63 = 0.016393 + 0.015873 = 0.032266
   * B: 1/62 + 1/62 = 0.032258
   * So A edges out B on being first in one arm, even though B is second in both.
   */
  it('ranks by summed reciprocal rank, not by score', async () => {
    const fused = new FusionRetriever([
      { name: 'x', retriever: stub(['A', 'B', 'C']) },
      { name: 'y', retriever: stub(['D', 'B', 'A']) },
    ]);

    const results = await fused.search('anything', 3);
    expect(results.map((r) => r.evidenceId)).toEqual(['A', 'B', 'D']);
    expect(results[0]!.score).toBeCloseTo(1 / 61 + 1 / 63, 6);
    expect(results[1]!.score).toBeCloseTo(2 / 62, 6);
  });

  // The arms score on unrelated scales — a BM25 score of 11 and a cosine of 0.6
  // cannot be added — so only rank may be combined. Scaling one arm's scores
  // must therefore change nothing.
  it('is unaffected by an arm rescaling its scores', async () => {
    const scaled: Retriever = {
      async search(_q, k) {
        return (['A', 'B', 'C'] as const)
          .slice(0, k)
          .map((evidenceId, index): Candidate => ({ evidenceId, score: (100 - index) * 1e6 }));
      },
    };

    const a = await new FusionRetriever([
      { name: 'x', retriever: stub(['A', 'B', 'C']) },
      { name: 'y', retriever: stub(['D', 'B', 'A']) },
    ]).search('q', 3);
    const b = await new FusionRetriever([
      { name: 'x', retriever: scaled },
      { name: 'y', retriever: stub(['D', 'B', 'A']) },
    ]).search('q', 3);

    expect(b.map((r) => r.evidenceId)).toEqual(a.map((r) => r.evidenceId));
  });

  it('exposes its parameters rather than hiding them as constants', () => {
    const fused = new FusionRetriever([{ name: 'x', retriever: stub(['A']) }]);
    expect(fused.parameters).toEqual({ rrfK: RRF_K, pool: FUSION_POOL, arms: ['x'] });
  });

  it('returns nothing for a non-positive k', async () => {
    expect(await new FusionRetriever([{ name: 'x', retriever: stub(['A']) }]).search('q', 0)).toEqual([]);
  });
});

describe('the committed embedding indexes', () => {
  const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
  const indexDir = resolve(repoRoot, 'knowledge/embeddings');
  const files = readdirSync(indexDir).filter((name) => name.endsWith('.json'));

  it('ingests cleanly and has at least one index', () => {
    expect(errors.map((e) => e.message)).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s covers the corpus and declares the model that built it', (file) => {
    const index = JSON.parse(readFileSync(resolve(indexDir, file), 'utf8')) as EmbeddingIndex;
    const model = embeddingModelByIdOrThrow(index.model.id);

    // A stale index scores cleanly and means nothing, so identity is checked
    // rather than assumed from the filename.
    expect(index.corpusVersion).toBe(corpusVersion);
    expect(index.indexVersion).toBe(indexVersion(corpusVersion, model));

    expect(index.vectors).toHaveLength(evidence.length);
    expect(new Set(index.vectors.map((v) => v.evidenceId))).toEqual(
      new Set(evidence.map((e) => e.id)),
    );
    for (const stored of index.vectors) {
      expect(stored.vector).toHaveLength(model.dimensions);
      // Normalised at build time, so cosine is a dot product.
      const norm = Math.sqrt(stored.vector.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 3);
    }
  });

  it('refuses an index built by a different model rather than scoring it', () => {
    const index = JSON.parse(
      readFileSync(resolve(indexDir, files[0]!), 'utf8'),
    ) as EmbeddingIndex;
    const wrong = { ...index, model: { ...index.model, id: 'Xenova/bge-small-en-v1.5' } };

    // Vectors from two models are not comparable; a silent mismatch would
    // produce a ranking that looks fine and means nothing.
    expect(() => new DenseRetriever(wrong as EmbeddingIndex, MINILM)).toThrow(/not comparable/);
  });
});
