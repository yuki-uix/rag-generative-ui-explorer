/**
 * Retrieval metrics for each arm on the same corpus and the same questions.
 *
 * #13 asks for lexical, dense, and fused reported side by side. They are
 * computed in one process from one ingest, so the three cannot silently differ
 * on the corpus, the chunking, or the question set — pinning the variables by
 * construction rather than by remembering to.
 *
 * No model is called: every metric here is mechanical.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BM25Retriever,
  DenseRetriever,
  FusionRetriever,
  embeddingModelByIdOrThrow,
  ingest,
  indexVersion,
  RRF_K,
  FUSION_POOL,
  parseEvalSet,
  type EmbeddingIndex,
  type Retriever,
} from '@rgux/corpus';
import { retrievalMetrics } from '../src/index.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const k = Number(process.argv.includes('--k') ? process.argv[process.argv.indexOf('--k') + 1] : 10);

const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  console.error('Ingestion errors:', errors.map((e) => e.message));
  process.exit(1);
}

const { set, problems } = parseEvalSet(
  readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'),
);
if (!set || problems.length > 0) {
  console.error('Question set problems:', problems);
  process.exit(1);
}
if (set.header.corpusVersion !== corpusVersion) {
  console.error(`Corpus drift: labels ${set.header.corpusVersion}, ingest ${corpusVersion}`);
  process.exit(1);
}

const lexical = new BM25Retriever(evidence);
const arms: { name: string; retriever: Retriever }[] = [{ name: 'lexical (BM25)', retriever: lexical }];

const indexDir = resolve(repoRoot, 'knowledge/embeddings');
for (const file of readdirSync(indexDir).filter((name) => name.endsWith('.json')).sort()) {
  const index = JSON.parse(readFileSync(resolve(indexDir, file), 'utf8')) as EmbeddingIndex;
  const model = embeddingModelByIdOrThrow(index.model.id);

  // A stored index built from a different corpus would score cleanly and mean
  // nothing, so the artifact's own identity is checked rather than its filename.
  const expected = indexVersion(corpusVersion, model);
  if (index.indexVersion !== expected || index.corpusVersion !== corpusVersion) {
    console.error(`${file}: stale index (${index.indexVersion}, expected ${expected}). Re-run corpus:embed.`);
    process.exit(1);
  }

  const dense = new DenseRetriever(index, model);
  arms.push({ name: `dense (${model.id.split('/')[1]})`, retriever: dense });
  arms.push({
    name: `fused (BM25 + ${model.id.split('/')[1]})`,
    retriever: new FusionRetriever([
      { name: 'lexical', retriever: lexical },
      { name: 'dense', retriever: dense },
    ]),
  });
}

console.log(`corpus ${corpusVersion}  questions ${set.header.questionCount}  k=${k}`);
// Recorded rather than left implicit: #13 asks for fusion parameters to be
// explicit, and `pool` in particular decides what fusion is even allowed to
// rescue. Neither has been tuned, and neither may be tuned against these
// questions — they exist to produce the number that would judge the tuning.
console.log(`fusion: RRF k=${RRF_K}, pool=${FUSION_POOL} (unmeasured defaults, not tuned)\n`);
console.log(`${'arm'.padEnd(34)} recall@k  any-hit    MRR   nDCG   zero`);

for (const arm of arms) {
  const m = await retrievalMetrics(arm.retriever, set.questions, k);
  console.log(
    `${arm.name.padEnd(34)} ` +
      `${(m.meanRecall * 100).toFixed(1).padStart(7)}% ` +
      `${(m.anyHitRate * 100).toFixed(1).padStart(7)}% ` +
      `${m.mrr.toFixed(3).padStart(6)} ` +
      `${m.ndcg.toFixed(3).padStart(6)} ` +
      `${String(m.zeroHitQuestionIds.length).padStart(6)}`,
  );
}
