import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { OCR, directoryBytes } from '../../src/image-experiment.js';
import { verifyControlFreeze, ControlEncoding, readControlVectors, readJSON, sha, lexicalRetriever, rankingMetrics, expectedHit1, classifyLegacyQuestion, stats, type Ranked } from '../../src/image-review.js';
const root = resolve(import.meta.dirname, '../../../../eval/images-review');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: evaluate-controls.ts --out FRESH_DIRECTORY');
const out = resolve(args[1]!);
const { figures, questions, families, config, freeze, freezeSha256 } = verifyControlFreeze(root);
const encoding = ControlEncoding.parse(readJSON(resolve(root, 'artifacts/encoding.json')));
const passes = readControlVectors(root, encoding);
const ocr = OCR.parse(readJSON(resolve(root, 'artifacts/ocr.json')));
if (Date.parse(ocr.startedAt) < Date.parse(freeze.frozenAt) || ocr.records.length !== figures.length || new Set(ocr.records.map(r => r.id)).size !== figures.length
  || ocr.records.some(r => figures.find(f => f.id === r.id)?.imageSha256 !== r.imageSha256 || r.text !== r.lines.map(l => l.text).join('\n'))) throw new Error('Control OCR coverage/freeze mismatch.');
const body = (path: string) => readFileSync(resolve(root, '../images', path), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '');
const sourceSearch = lexicalRetriever(families.map(family => ({ id: family, text: body(figures.find(f => f.family === family)!.source) })));
const optical = lexicalRetriever(ocr.records.map(r => ({ id: r.id, text: r.text })));
const visible = lexicalRetriever(figures.map(f => ({ id: f.id, text: f.visibleText.join('\n') })));
const sort = (r: Ranked[]) => r.sort((a, b) => b.score - a.score || a.evidenceId.localeCompare(b.evidenceId));
const arms = ['source-text', 'ocr', 'clip', 'visible-text-control'] as const;
type Arm = typeof arms[number];
type Metrics = ReturnType<typeof rankingMetrics>;
type Row = { repetition: number; arm: Arm; questionId: string; kind: string; ranking: Ranked[]; searchMs: number; metrics: Metrics; expectedHit1: number | null; sourceHit1: number; withinFamily: { metrics: Metrics; expectedHit1: number | null }; clipTopicOnlyHit1: number | null };
const records: Row[] = [];
for (const pass of passes) for (const [index, q] of questions.entries()) {
  const rotation = (index + pass.repetition - 1) % arms.length;
  for (const arm of [...arms.slice(rotation), ...arms.slice(0, rotation)]) {
    const start = performance.now();
    const query = pass.rows.find(r => r.kind === 'query' && r.id === q.id)!;
    const ranking = arm === 'source-text' ? sort((await sourceSearch(q.question)).flatMap(r => figures.filter(f => f.family === r.evidenceId).map(f => ({ evidenceId: f.id, score: r.score }))))
      : arm === 'ocr' ? await optical(q.question) : arm === 'visible-text-control' ? await visible(q.question)
        : sort(pass.rows.filter(r => r.kind === 'image').map(r => ({ evidenceId: r.id, score: r.vector.reduce((s, v, i) => s + v * query.vector[i]!, 0) })));
    const searchMs = performance.now() - start;
    const familyIds = figures.filter(f => f.family === q.family).map(f => f.id);
    // Condition only on the original full ranking: do not rebuild per-family
    // indexes, whose IDF would change and create another retrieval algorithm.
    const within = ranking.filter(r => familyIds.includes(r.evidenceId));
    const topicQuery = pass.rows.find(r => r.kind === 'query' && r.id === `${q.family}-topic`)!;
    const topicRank = sort(pass.rows.filter(r => r.kind === 'image' && familyIds.includes(r.id)).map(r => ({ evidenceId: r.id, score: r.vector.reduce((s, v, i) => s + v * topicQuery.vector[i]!, 0) })));
    records.push({ repetition: pass.repetition, arm, questionId: q.id, kind: q.kind, ranking, searchMs,
      metrics: rankingMetrics(ranking.map(r => r.evidenceId), q.goldenImageIds), expectedHit1: expectedHit1(ranking, q.goldenImageIds),
      sourceHit1: ranking.length ? Number(familyIds.includes(ranking[0]!.evidenceId)) : 0,
      withinFamily: { metrics: rankingMetrics(within.map(r => r.evidenceId), q.goldenImageIds), expectedHit1: expectedHit1(within, q.goldenImageIds) },
      clipTopicOnlyHit1: arm === 'clip' && q.kind === 'conjunction' ? Number(q.goldenImageIds.includes(topicRank[0]!.evidenceId)) : null });
  }
}
const mean = (values: number[]) => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
const summary = arms.flatMap(arm => ['conjunction', 'color', 'layout', 'topic'].map(kind => {
  const rows = records.filter(r => r.arm === arm && r.kind === kind);
  const repetitions = [1, 2, 3].map(repetition => {
    const group = rows.filter(r => r.repetition === repetition);
    return { repetition, fullHit1: mean(group.map(r => r.metrics!.hit1)), sourceHit1: mean(group.map(r => r.sourceHit1)),
      fullRecall5: mean(group.map(r => r.metrics!.recall5)), withinHit1: mean(group.map(r => r.withinFamily.metrics!.hit1)),
      tieExpectedHit1: mean(group.map(r => r.withinFamily.expectedHit1!)),
      topicOnlyHit1: arm === 'clip' && kind === 'conjunction' ? mean(group.map(r => r.clipTopicOnlyHit1!)) : null };
  });
  return { arm, kind, uniqueQuestions: new Set(rows.map(r => r.questionId)).size, repetitions,
    searchMs: stats(rows.map(r => r.searchMs)) };
}));
const legacyRoot = resolve(root, '../images');
const legacyQuestions = z.object({ questions: z.array(z.object({ id: z.string(), group: z.string(), category: z.string(), question: z.string(), goldenImageIds: z.array(z.string()) })) }).parse(readJSON(resolve(legacyRoot, 'questions.json'))).questions;
const legacyFigures = z.object({ figures: z.array(z.object({ id: z.string(), group: z.string(), render: z.object({ nodes: z.array(z.string()) }) })) }).parse(readJSON(resolve(legacyRoot, 'manifest.json'))).figures;
const legacyRows = z.array(z.object({ repetition: z.number(), arm: z.string(), questionId: z.string(), ranking: z.array(z.object({ evidenceId: z.string(), score: z.number() })) })).parse(readFileSync(resolve(legacyRoot, 'results/2026-10-21/records.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
const goldAudit = legacyQuestions.map(q => {
  const assessment = classifyLegacyQuestion(q.id, q.category);
  const literal = q.category === 'literal' ? q.question.match(/contains the label "([^"]+)"/)?.[1] : null;
  const exactMatches = literal ? legacyFigures.filter(f => f.group === q.group && f.render.nodes.includes(literal)).map(f => f.id) : null;
  if (literal && JSON.stringify(exactMatches?.sort()) !== JSON.stringify([...q.goldenImageIds].sort())) throw new Error('Legacy literal gold failed exact rendered-label review.');
  return { questionId: q.id, originalGold: q.goldenImageIds, ...assessment, exactLabelMatches: exactMatches,
    knownAlternative: q.id === 'figure-03-a-concept' ? ['figure-03-a', 'figure-03-b'] : null };
});
const legacyDiagnostics = ['literal', 'layout'].flatMap(category => ['text', 'ocr', 'clip'].map(arm => {
  const rows = legacyRows.filter(r => r.arm === arm && legacyQuestions.find(q => q.id === r.questionId)!.category === category);
  return { arm, category, uniqueQuestions: new Set(rows.map(r => r.questionId)).size,
    deterministicHit1: mean(rows.map(r => rankingMetrics(r.ranking.map(x => x.evidenceId), legacyQuestions.find(q => q.id === r.questionId)!.goldenImageIds)!.hit1)),
    tieExpectedHit1: mean(rows.map(r => expectedHit1(r.ranking, legacyQuestions.find(q => q.id === r.questionId)!.goldenImageIds)!)),
    sourceFamilyHit1: mean(rows.map(r => Number(legacyFigures.find(f => f.id === r.ranking[0]?.evidenceId)?.group === legacyQuestions.find(q => q.id === r.questionId)!.group))) };
}));
const bytes = directoryBytes(root);
if (bytes > config.artifactBudgetBytes) throw new Error('Control artifact budget exceeded.');
const result = { version: 'image-review-report-1', freezeSha256, legacyLedgerSha256: sha(readFileSync(resolve(legacyRoot, 'observations.json'))),
  ocrSha256: sha(readFileSync(resolve(root, 'artifacts/ocr.json'))), encodingSha256: sha(readFileSync(resolve(root, 'artifacts/encoding.json'))),
  samples: { figures: figures.length, families: families.length, questions: questions.length, repetitions: 3 }, summary, legacyDiagnostics,
  timing: { ocrMs: ocr.totalMs, clipLoadMs: encoding.loadMs, clipTotalMs: encoding.totalMs, peakRssKiB: encoding.peakRssKiB,
    imageMs: stats(encoding.passes.flatMap(p => p.rows.filter(r => r.kind === 'image').map(r => r.elapsedMs))),
    queryMs: stats(encoding.passes.flatMap(p => p.rows.filter(r => r.kind === 'query').map(r => r.elapsedMs))) } };
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
writeFileSync(resolve(out, 'gold-audit.json'), JSON.stringify({ method: 'post-hoc same-assistant review; not independently adjudicated', rows: goldAudit }, null, 2) + '\n', { flag: 'wx' });
// Full score rows remain inspectable; float32 binary tensors stay immutable.
writeFileSync(resolve(out, 'records.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ records: records.length, bytes, out }));
