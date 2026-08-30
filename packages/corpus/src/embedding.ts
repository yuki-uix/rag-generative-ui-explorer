import { createHash } from 'node:crypto';
import { pipeline } from '@huggingface/transformers';

/**
 * The embedding model, pinned.
 *
 * `knowledge/rag/dense-retrieval.md` argues that the index is a function of the
 * embedding model: change it and every stored vector is stale, with no partial
 * migration, so the model belongs to the identity of the index rather than to
 * its configuration. That is why the name and revision are recorded in the
 * artifact and folded into `indexVersion`.
 *
 * It runs locally. Neither key this project holds can produce embeddings —
 * Anthropic's API has no embeddings endpoint, and DeepSeek is reached through
 * its Anthropic-compatible one — so a hosted model would mean a third provider
 * and a third secret. A local model also pins more exactly than a hosted one:
 * a served model can change under a fixed name, and a downloaded revision
 * cannot.
 */
export interface EmbeddingModel {
  readonly id: string;
  /** Pinned revision, so a moved tag cannot silently re-embed the corpus. */
  readonly revision: string;
  readonly dimensions: number;
  /**
   * Prefix prepended to a query, not to a passage.
   *
   * Some models are trained asymmetrically and score everything alike without
   * it. Recorded per model rather than applied globally, because applying one
   * model's prefix to another that was not trained with it makes the query
   * text differ from anything the model saw.
   */
  readonly queryPrefix: string;
}

export const MINILM: EmbeddingModel = {
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: 'main',
  dimensions: 384,
  queryPrefix: '',
};

export const BGE_SMALL: EmbeddingModel = {
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'main',
  dimensions: 384,
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
};

export const EMBEDDING_MODELS: readonly EmbeddingModel[] = [MINILM, BGE_SMALL];

export function embeddingModelByIdOrThrow(id: string): EmbeddingModel {
  const model = EMBEDDING_MODELS.find((candidate) => candidate.id === id);
  if (!model) {
    throw new Error(
      `Unknown embedding model: ${id}. Known: ${EMBEDDING_MODELS.map((m) => m.id).join(', ')}`,
    );
  }
  return model;
}

/**
 * Index identity: the corpus and the model that embedded it.
 *
 * Kept separate from `corpusVersion`, which is about the notes and the chunking
 * and is what the evaluation labels were made against. Those labels name chunks,
 * not vectors, so re-embedding does not invalidate them — but a result produced
 * with one model cannot be compared to one produced with another, and this is
 * what records that.
 */
export function indexVersion(corpusVersion: string, model: EmbeddingModel): string {
  const hash = createHash('sha256')
    .update(`${corpusVersion}\n${model.id}@${model.revision}\n${model.dimensions}`)
    .digest('hex')
    .slice(0, 12);
  return `index-${hash}`;
}

/**
 * The slice of the extractor this module uses.
 *
 * Structural rather than imported: the library's own pipeline type is a union
 * wide enough that TypeScript refuses to represent it once another package
 * typechecks these sources through the workspace link — which `apps/web` does,
 * because its tests import the corpus. Naming what is used keeps that weight
 * out of every consumer's typecheck, and makes the surface this depends on
 * explicit enough to see if it moves.
 */
interface Extractor {
  (texts: string[], options: { pooling: 'mean'; normalize: boolean }): Promise<{
    tolist(): unknown;
  }>;
}

let cached: { id: string; pipe: Extractor } | undefined;

async function extractor(model: EmbeddingModel): Promise<Extractor> {
  if (cached?.id !== model.id) {
    cached = {
      id: model.id,
      pipe: (await pipeline('feature-extraction', model.id, {
        revision: model.revision,
      })) as unknown as Extractor,
    };
  }
  return cached.pipe;
}

/** Mean-pooled, L2-normalised vectors, so cosine similarity is a dot product. */
export async function embed(
  texts: readonly string[],
  model: EmbeddingModel,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const pipe = await extractor(model);
  const output = await pipe([...texts], { pooling: 'mean', normalize: true });
  return output.tolist() as number[][];
}

export async function embedQuery(query: string, model: EmbeddingModel): Promise<number[]> {
  const [vector] = await embed([`${model.queryPrefix}${query}`], model);
  return vector!;
}
