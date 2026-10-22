import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { sha, readJSON, safePath, rankingMetrics, lexicalRetriever, stats } from './image-experiment.js';
import { verifyImageObservations } from './image-observations.js';
export { sha, readJSON, rankingMetrics, lexicalRetriever, stats };
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Color = z.enum(['blue', 'orange']);
const Layout = z.enum(['column', 'diamond']);
export const ReviewConfig = z.strictObject({
  version: z.literal('image-review-1'), model: z.literal('Xenova/clip-vit-base-patch32'),
  revision: z.literal('d15189d7028b43f1d3e65039190477f6af591c2a'), dtype: z.literal('q8'),
  device: z.literal('cpu'), dimensions: z.literal(512), repetitions: z.literal(3),
  maxTokens: z.literal(77), artifactBudgetBytes: z.number().int().positive(),
});
const Figure = z.strictObject({
  id: z.string(), family: z.string(), title: z.string(), image: z.string(), imageSha256: Hash,
  source: z.string(), sourceSha256: Hash, color: Color, layout: Layout,
  visibleText: z.array(z.string()).length(5), sourceFigure: z.string(), width: z.literal(768), height: z.literal(768),
});
const Question = z.strictObject({
  id: z.string(), family: z.string(), kind: z.enum(['conjunction', 'color', 'layout', 'topic']),
  question: z.string(), goldenImageIds: z.array(z.string()),
});
export type ControlQuestion = z.infer<typeof Question>;
export type Ranked = { evidenceId: string; score: number };
export function loadControls(root: string) {
  const config = ReviewConfig.parse(readJSON(resolve(root, 'config.json')));
  const manifest = z.strictObject({ version: z.literal('image-review-controls-1'), purpose: z.string(), figures: z.array(Figure).length(24) }).parse(readJSON(resolve(root, 'manifest.json')));
  const { questions } = z.strictObject({ version: z.literal('image-review-questions-1'), language: z.literal('en'), questions: z.array(Question).length(54) }).parse(readJSON(resolve(root, 'questions.json')));
  const figures = manifest.figures;
  if (new Set(figures.map(f => f.id)).size !== 24 || new Set(questions.map(q => q.id)).size !== 54) throw new Error('Duplicate control IDs.');
  const families = [...new Set(figures.map(f => f.family))];
  if (families.length !== 6) throw new Error('Control family count changed.');
  for (const f of figures) {
    if (sha(readFileSync(safePath(root, f.image))) !== f.imageSha256) throw new Error('Control image bytes changed.');
    if (sha(readFileSync(safePath(resolve(root, '../images'), f.source))) !== f.sourceSha256) throw new Error('Control source changed.');
  }
  for (const family of families) {
    const local = figures.filter(f => f.family === family);
    if (local.length !== 4 || new Set(local.map(f => `${f.color}/${f.layout}`)).size !== 4) throw new Error('Missing factorial variant.');
    if (local.some(f => f.title !== local[0]!.title || f.source !== local[0]!.source || JSON.stringify(f.visibleText) !== JSON.stringify(local[0]!.visibleText))) throw new Error('Printed text/source differs inside a visual family.');
    const localQuestions = questions.filter(q => q.family === family);
    for (const [kind, n] of [['conjunction', 4], ['color', 2], ['layout', 2], ['topic', 1]] as const) {
      if (localQuestions.filter(q => q.kind === kind).length !== n) throw new Error('Unbalanced control questions.');
    }
    const expectedQueries = new Map<string, string[]>();
    const topic = local[0]!.title.toLowerCase();
    const position = (layout: string) => layout === 'column' ? 'a vertical column' : 'a diamond';
    for (const color of ['blue', 'orange']) for (const layout of ['column', 'diamond']) expectedQueries.set(`Find the ${topic} diagram with ${color} boxes arranged in ${position(layout)}.`, local.filter(f => f.color === color && f.layout === layout).map(f => f.id));
    for (const color of ['blue', 'orange']) expectedQueries.set(`Find the ${topic} diagram with ${color} boxes.`, local.filter(f => f.color === color).map(f => f.id));
    for (const layout of ['column', 'diamond']) expectedQueries.set(`Find the ${topic} diagram with boxes arranged in ${position(layout)}.`, local.filter(f => f.layout === layout).map(f => f.id));
    expectedQueries.set(`Find a ${topic} diagram.`, local.map(f => f.id));
    if (new Set(localQuestions.map(q => q.question)).size !== 9) throw new Error('Duplicate style question.');
    for (const q of localQuestions) {
      const gold = expectedQueries.get(q.question);
      const expectedKind = q.question.includes(' boxes arranged') ? (q.question.includes('with boxes') ? 'layout' : 'conjunction') : q.question.includes(' boxes.') ? 'color' : 'topic';
      if (q.kind !== expectedKind || !gold || JSON.stringify([...gold].sort()) !== JSON.stringify([...q.goldenImageIds].sort())) throw new Error('Question or factorial gold mismatch.');
    }
  }
  return { config, figures, questions, families };
}
export function verifyControlFreeze(root: string) {
  const inputs = loadControls(root);
  const frozenBytes = readFileSync(resolve(root, 'freeze.json'));
  const freeze = z.strictObject({ version: z.literal('image-control-freeze-1'), frozenAt: z.iso.datetime(), legacyFreezeSha256: Hash, legacyLedgerSha256: Hash, files: z.record(z.string(), Hash), code: z.record(z.string(), Hash) }).parse(JSON.parse(frozenBytes.toString()));
  const legacy = resolve(root, '../images');
  verifyImageObservations(legacy);
  if (freeze.legacyFreezeSha256 !== sha(readFileSync(resolve(legacy, 'freeze.json'))) || freeze.legacyLedgerSha256 !== sha(readFileSync(resolve(legacy, 'observations.json')))) throw new Error('Legacy observations drifted.');
  const expected = ['config.json', 'PROTOCOL.md', 'manifest.json', 'questions.json', 'build-controls.py', 'corrections/query-transformation.png', ...inputs.figures.map(f => f.image)].sort();
  if (JSON.stringify(Object.keys(freeze.files).sort()) !== JSON.stringify(expected)) throw new Error('Incomplete control freeze.');
  for (const [path, hash] of Object.entries(freeze.files)) if (sha(readFileSync(safePath(root, path))) !== hash) throw new Error('Frozen control input changed.');
  for (const [path, hash] of Object.entries(freeze.code)) if (sha(readFileSync(safePath(resolve(root, '../..'), path))) !== hash) throw new Error('Frozen control execution changed.');
  return { ...inputs, freeze, freezeSha256: sha(frozenBytes) };
}
/** Probability of a relevant top result under a uniform exact-score tie.
 * This does not jitter scores or change the stored deterministic ranking. */
export function expectedHit1(ranking: Ranked[], golden: string[]) {
  if (!golden.length) return null;
  if (!ranking.length) return 0;
  const tied = ranking.filter(r => r.score === ranking[0]!.score);
  return tied.filter(r => golden.includes(r.evidenceId)).length / tied.length;
}
export function classifyLegacyQuestion(id: string, category: string) {
  if (category === 'literal') return { status: 'exact-label-lookup', primary: true, reason: 'Quoted label and topic identify one rendered image; not a semantic-answer judgment.' };
  if (category === 'negative') return { status: 'negative-diagnostic', primary: false, reason: 'No calibrated abstention rule; do not score answer refusal.' };
  if (category === 'layout') return { status: 'confounded-layout', primary: false, reason: 'All requested orange branch images also differ in words, arrows and OCR lengths; no isolated visual attribution.' };
  if (id === 'figure-03-a-concept') return { status: 'incomplete-gold', primary: false, reason: 'figure-03-b explicitly fuses ranked lexical/dense lists with RRF and is also relevant. The single-positive original label is incomplete.' };
  if (id === 'figure-07-a-concept') return { status: 'diagram-content-erratum', primary: false, reason: 'Original intent is incorrectly drawn as a final serial stage, not an invariant. Source mitigation retrieves original and rewritten queries and fuses candidates.' };
  return { status: 'target-only-not-exhaustive', primary: false, reason: 'Intended flow is present, but other candidates were not exhaustively adjudicated for broad semantic relevance; no unique-gold effectiveness claim.' };
}
export const ControlEncoding = z.strictObject({
  version: z.literal('image-control-encoding-1'), freezeSha256: Hash,
  startedAt: z.iso.datetime(), completedAt: z.iso.datetime(), loadMs: z.number().nonnegative(), totalMs: z.number().nonnegative(), peakRssKiB: z.number().positive(),
  runtime: z.object({ node: z.string(), cpu: z.string(), platform: z.string(), arch: z.string(), transformers: z.literal('3.8.1'), onnxruntime: z.string() }),
  model: z.literal('Xenova/clip-vit-base-patch32'), revision: z.literal('d15189d7028b43f1d3e65039190477f6af591c2a'), dtype: z.literal('q8'), device: z.literal('cpu'),
  storage: z.literal('raw-projected-float32-le; L2 normalize during scoring'), providerApiCalls: z.literal(0),
  modelFiles: z.array(z.object({ path: z.string(), sha256: Hash, bytes: z.number().int().positive() })),
  passes: z.array(z.strictObject({ repetition: z.number().int().min(1).max(3), file: z.string(), sha256: Hash, bytes: z.number().int().positive(), rows: z.array(z.strictObject({ id: z.string(), kind: z.enum(['image', 'query']), elapsedMs: z.number().nonnegative() })) })).length(3),
});
export function readControlVectors(root: string, metadata: z.infer<typeof ControlEncoding>) {
  const inputs = verifyControlFreeze(root);
  if (metadata.freezeSha256 !== inputs.freezeSha256 || Date.parse(metadata.startedAt) < Date.parse(inputs.freeze.frozenAt)) throw new Error('Encoding/freeze mismatch.');
  const original = z.object({ modelFiles: z.array(z.object({ path: z.string(), sha256: Hash, bytes: z.number() })) }).parse(readJSON(resolve(root, '../images/artifacts/encoding.json')));
  if (JSON.stringify(metadata.modelFiles) !== JSON.stringify(original.modelFiles)) throw new Error('Model/tokenizer/processor identities differ.');
  if (new Set(metadata.passes.map(p => p.repetition)).size !== 3) throw new Error('Repeated control pass ID.');
  const expected = [...inputs.figures.map(f => ({ id: f.id, kind: 'image' })), ...inputs.questions.map(q => ({ id: q.id, kind: 'query' }))];
  return metadata.passes.map(pass => {
    if (JSON.stringify(pass.rows.map(({ id, kind }) => ({ id, kind }))) !== JSON.stringify(expected)) throw new Error('Incomplete or reordered control vectors.');
    const binary = readFileSync(safePath(root, pass.file));
    if (binary.length !== expected.length * 512 * 4 || binary.length !== pass.bytes || sha(binary) !== pass.sha256) throw new Error('Control vector bytes mismatch.');
    const rows = pass.rows.map((row, index) => {
      const raw = Array.from({ length: 512 }, (_, j) => binary.readFloatLE((index * 512 + j) * 4));
      const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
      if (!Number.isFinite(norm) || norm <= 0) throw new Error('Non-finite/zero control vector.');
      return { ...row, vector: raw.map(v => v / norm) };
    });
    return { repetition: pass.repetition, rows };
  });
}
