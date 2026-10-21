import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BM25Retriever } from './bm25.js';
import type { Evidence } from '@rgux/contracts';

export const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Split = z.enum(['development', 'evaluation']);
export const ImageConfig = z.strictObject({ version: z.literal('image-retrieval-1'), model: z.literal('Xenova/clip-vit-base-patch32'), revision: z.string().regex(/^[a-f0-9]{40}$/), dtype: z.literal('q8'), device: z.literal('cpu'), dimensions: z.literal(512), repetitions: z.literal(3), ks: z.tuple([z.literal(1), z.literal(3), z.literal(5)]), queryTemplate: z.literal('raw'), maxTokens: z.literal(77), artifactBudgetBytes: z.number().int().positive() });
const Figure = z.object({ id: z.string(), group: z.string(), split: Split, image: z.string(), imageSha256: Hash, width: z.literal(768), height: z.literal(768), source: z.string(), sourceSha256: Hash, sourcePath: z.string(), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), authorship: z.string(), license: z.string(), render: z.object({ layout: z.string(), nodes: z.array(z.string()), pillow: z.string() }) });
const Question = z.strictObject({ id: z.string(), group: z.string(), split: Split, category: z.enum(['literal', 'concept', 'layout', 'negative']), question: z.string().min(1), goldenImageIds: z.array(z.string()), rationale: z.string() });
const Manifest = z.object({ version: z.literal('image-corpus-1'), author: z.string(), blind: z.literal(false), figures: z.array(Figure).length(24) });
const Questions = z.object({ version: z.literal('image-questions-1'), language: z.literal('en'), author: z.string(), questions: z.array(Question).length(52) });
export type ImageQuestion = z.infer<typeof Question>;
export const readJSON = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
export function safePath(root: string, path: string) {
  const target = resolve(root, path), rel = relative(root, target);
  if (rel.startsWith('..' + sep) || rel === '..' || resolve(path) === path) throw new Error('Path escapes experiment.');
  return target;
}
export function loadImageInputs(root: string) {
  const config = ImageConfig.parse(readJSON(resolve(root, 'config.json')));
  const manifest = Manifest.parse(readJSON(resolve(root, 'manifest.json')));
  const { questions } = Questions.parse(readJSON(resolve(root, 'questions.json')));
  const figures = manifest.figures;
  if (new Set(figures.map(f => f.id)).size !== figures.length || new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('Duplicate figure or question IDs.');
  const groups = new Map<string, string>();
  for (const f of figures) {
    if (groups.has(f.group) && groups.get(f.group) !== f.split) throw new Error('Source group leaks across splits.');
    groups.set(f.group, f.split);
    for (const [file, hash] of [[f.image, f.imageSha256], [f.source, f.sourceSha256]]) {
      if (sha(readFileSync(safePath(root, file!))) !== hash) throw new Error('Stale image/source bytes.');
    }
  }
  // Both source path and exact contents must remain in one split, even if a
  // future author renames a group or copies a note under another identifier.
  for (const key of ['sourcePath', 'sourceSha256', 'imageSha256'] as const) {
    const seen = new Map<string, string>();
    for (const f of figures) {
      if (seen.has(f[key]) && seen.get(f[key]) !== f.split) throw new Error('Duplicate content/source leaks across splits.');
      seen.set(f[key], f.split);
    }
  }
  for (const q of questions) {
    if (new Set(q.goldenImageIds).size !== q.goldenImageIds.length || q.goldenImageIds.some(id => !figures.some(f => f.id === id && f.group === q.group && f.split === q.split))) throw new Error('Unknown or cross-split golden image.');
    if ((q.category === 'negative') !== (q.goldenImageIds.length === 0)) throw new Error('Negative/golden mismatch.');
  }
  return { config, figures, questions };
}
export function inputPaths(root: string) {
  const { figures } = loadImageInputs(root);
  return [...new Set(['config.json', 'PROTOCOL.md', 'manifest.json', 'questions.json', 'build-corpus.py', ...figures.flatMap(f => [f.image, f.source])])].sort();
}
export function verifyFreeze(root: string) {
  const freezeSource = readFileSync(resolve(root, 'freeze.json'));
  const freeze = z.strictObject({ version: z.literal('image-freeze-1'), frozenAt: z.iso.datetime(), files: z.record(z.string(), Hash), code: z.record(z.string(), Hash) }).parse(JSON.parse(freezeSource.toString()));
  const paths = inputPaths(root);
  if (JSON.stringify(Object.keys(freeze.files).sort()) !== JSON.stringify(paths)) throw new Error('Freeze coverage changed.');
  for (const [path, hash] of Object.entries(freeze.files)) if (sha(readFileSync(safePath(root, path))) !== hash) throw new Error('Frozen inputs changed.');
  const repository = resolve(root, '../..');
  for (const [path, hash] of Object.entries(freeze.code)) if (sha(readFileSync(safePath(repository, path))) !== hash) throw new Error('Frozen execution code changed.');
  return { ...loadImageInputs(root), freezeSha256: sha(freezeSource), freeze };
}
export const OCR = z.object({ version: z.literal('image-ocr-1'), engine: z.literal('Apple Vision VNRecognizeTextRequest'), revision: z.literal(3), recognitionLevel: z.literal('accurate'), languages: z.tuple([z.literal('en-US')]), languageCorrection: z.literal(false), os: z.string(), startedAt: z.string(), completedAt: z.string(), totalMs: z.number().nonnegative(), records: z.array(z.object({ id: z.string(), imageSha256: Hash, text: z.string(), elapsedMs: z.number().nonnegative(), lines: z.array(z.object({ text: z.string(), confidence: z.number().min(0).max(1), box: z.array(z.number()).length(4) })) })) });
const Vector = z.array(z.number().finite()).length(512).refine(v => Math.abs(v.reduce((s,x) => s+x*x,0)-1)<0.0001, 'Non-unit embedding');
const Embedding = z.strictObject({ id: z.string(), vector: Vector, elapsedMs: z.number().nonnegative() });
export const Encoding = z.object({ version: z.literal('image-encoding-1'), freezeSha256: Hash, model: z.string(), revision: z.string(), dtype: z.literal('q8'), device: z.literal('cpu'), dimensions: z.literal(512), runtime: z.object({ transformers: z.literal('3.8.1'), node: z.string(), platform: z.string(), arch: z.string(), cpu: z.string(), onnxruntime: z.string() }), startedAt: z.iso.datetime(), completedAt: z.iso.datetime(), loadMs: z.number().nonnegative(), totalMs: z.number().nonnegative(), peakRssKiB: z.number().positive(), providerApiCalls: z.literal(0), modelFiles: z.array(z.object({ path: z.string(), sha256: Hash, bytes: z.number().int().positive() })).min(5), processor: z.unknown(), passes: z.array(z.strictObject({ repetition: z.number().int().min(1).max(3), images: z.array(Embedding), queries: z.array(Embedding) })).length(3) });
export function validateObservations(root: string, ocr: z.infer<typeof OCR>, encoding: z.infer<typeof Encoding>) {
  const inputs = verifyFreeze(root);
  if (encoding.freezeSha256 !== inputs.freezeSha256 || encoding.model !== inputs.config.model || encoding.revision !== inputs.config.revision) throw new Error('Encoding provenance drifted.');
  const exact = (expected: string[], got: string[]) => expected.length === got.length && new Set(got).size === got.length && expected.every(id => got.includes(id));
  if (!exact(inputs.figures.map(f => f.id), ocr.records.map(r => r.id)) || ocr.records.some(r => inputs.figures.find(f => f.id === r.id)?.imageSha256 !== r.imageSha256 || r.text !== r.lines.map(l => l.text).join('\n'))) throw new Error('OCR coverage or source mismatch.');
  if (new Set(encoding.passes.map(p => p.repetition)).size !== 3) throw new Error('Duplicate encoding pass.');
  for (const pass of encoding.passes) if (!exact(inputs.figures.map(f => f.id), pass.images.map(r => r.id)) || !exact(inputs.questions.map(q => q.id), pass.queries.map(r => r.id))) throw new Error('Embedding coverage mismatch.');
  return inputs;
}
export function lexicalRetriever(documents: { id: string; text: string }[]) {
  // Reuse the actual lexical implementation without sending image IDs to the
  // product evidence gate. These temporary text rows never become UI evidence.
  const retriever = new BM25Retriever(documents.map(d => ({ id: d.id, text: d.text, documentId: d.id, documentTitle: d.id, retrievalScore: 0, metadata: {} } satisfies Evidence)));
  return async (query: string) => (await retriever.search(query, documents.length)).sort((a,b) => b.score-a.score || a.evidenceId.localeCompare(b.evidenceId));
}
export function rankingMetrics(ranking: string[], golden: string[]) {
  if (!golden.length) return null;
  const relevant = new Set(golden);
  const recall = (k: number) => ranking.slice(0,k).filter(id => relevant.has(id)).length / relevant.size;
  const top = ranking.slice(0,5), first = top.findIndex(id => relevant.has(id));
  const dcg = top.reduce((sum,id,i) => sum + (relevant.has(id) ? 1/Math.log2(i+2) : 0),0);
  const ideal = [...relevant].slice(0,5).reduce((sum,_,i) => sum+1/Math.log2(i+2),0);
  return { recall1: recall(1), recall3: recall(3), recall5: recall(5), hit1: Number(recall(1)>0), hit3: Number(recall(3)>0), hit5: Number(recall(5)>0), mrr5: first<0 ? 0 : 1/(first+1), ndcg5: dcg/ideal };
}
export function stats(values: number[]) {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b), m=Math.floor(sorted.length/2);
  return { n: values.length, median: sorted.length%2 ? sorted[m]! : (sorted[m-1]!+sorted[m]!)/2, min: sorted[0]!, max: sorted.at(-1)! };
}
export function directoryBytes(root: string): number {
  return readdirSync(root,{withFileTypes:true}).filter(item => !['.cache', 'runs'].includes(item.name)).reduce((sum,item) => sum+(item.isDirectory() ? directoryBytes(resolve(root,item.name)) : statSync(resolve(root,item.name)).size),0);
}
