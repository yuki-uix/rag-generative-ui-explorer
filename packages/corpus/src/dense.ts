import type { Candidate, Retriever } from './retriever.js';
import { embedQuery, type EmbeddingModel } from './embedding.js';

/** One chunk's stored vector. */
export interface StoredVector {
  readonly evidenceId: string;
  readonly vector: readonly number[];
}

/** The artifact `corpus:embed` writes and `DenseRetriever` reads. */
export interface EmbeddingIndex {
  readonly indexVersion: string;
  readonly corpusVersion: string;
  readonly model: { readonly id: string; readonly revision: string; readonly dimensions: number };
  readonly vectors: readonly StoredVector[];
}

/**
 * Dense retrieval over stored vectors.
 *
 * Vectors are L2-normalised at build time, so cosine similarity is a dot
 * product and no per-query normalisation is needed. The scan is linear over 210
 * chunks — the `Retriever` seam is where an approximate index would substitute
 * in, and at this size an exact scan is both faster to build and impossible to
 * get subtly wrong.
 */
export class DenseRetriever implements Retriever {
  private readonly vectors: readonly StoredVector[];

  constructor(
    index: EmbeddingIndex,
    private readonly model: EmbeddingModel,
  ) {
    if (index.model.id !== model.id || index.model.revision !== model.revision) {
      throw new Error(
        `Index was built with ${index.model.id}@${index.model.revision}, ` +
          `but ${model.id}@${model.revision} was supplied. Vectors from two models are not comparable.`,
      );
    }
    this.vectors = index.vectors;
  }

  async search(query: string, k: number): Promise<Candidate[]> {
    if (k <= 0 || this.vectors.length === 0 || query.trim().length === 0) return [];

    const q = await embedQuery(query, this.model);

    return this.vectors
      .map((stored) => ({
        evidenceId: stored.evidenceId,
        score: stored.vector.reduce((sum, value, index) => sum + value * q[index]!, 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
