import { readFileSync, writeFileSync, cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { it, expect } from 'vitest';
import { loadControls, verifyControlFreeze, expectedHit1, classifyLegacyQuestion, ControlEncoding, readControlVectors, readJSON, sha } from '../src/image-review.js';
import { rankingMetrics } from '../src/image-experiment.js';
import { verifyReviewObservations } from '../src/image-review-observations.js';
const root = resolve(import.meta.dirname, '../../../eval/images-review');
const corpus = resolve(import.meta.dirname, '..');
function fixture(change: (path: string) => void) {
  const base = mkdtempSync(join(tmpdir(), 'review-controls-'));
  const target = join(base, 'images-review');
  try {
    cpSync(root, target, { recursive: true, filter: p => !p.includes('/runs') });
    mkdirSync(join(base, 'images'), { recursive: true });
    cpSync(resolve(root, '../images/sources'), join(base, 'images/sources'), { recursive: true });
    change(target);
  } finally { rmSync(base, { recursive: true, force: true }); }
}
it('verifies a fully crossed, identical-word corpus and the sealed real observations', () => {
  const { figures, questions } = verifyControlFreeze(root);
  expect(figures).toHaveLength(24); expect(questions).toHaveLength(54);
  for (const q of questions) expect(q.goldenImageIds).toHaveLength(q.kind === 'conjunction' ? 1 : q.kind === 'topic' ? 4 : 2);
  expect(verifyReviewObservations(root).version).toBe('image-control-ledger-1');
});
it('rejects textual shortcuts, missing factorial variants and incorrect gold', () => {
  for (const mutation of [
    (m: any) => { m.figures[0].visibleText[1] = 'blue shortcut'; },
    (m: any) => { m.figures[0].color = m.figures[1].color; m.figures[0].layout = m.figures[1].layout; },
  ]) fixture(path => {
    const m: any = readJSON(join(path, 'manifest.json')); mutation(m);
    writeFileSync(join(path, 'manifest.json'), JSON.stringify(m));
    expect(() => loadControls(path)).toThrow(/Printed|factorial/);
  });
  fixture(path => {
    const q: any = readJSON(join(path, 'questions.json')); q.questions[0].goldenImageIds = [q.questions[1].goldenImageIds[0]];
    writeFileSync(join(path, 'questions.json'), JSON.stringify(q));
    expect(() => loadControls(path)).toThrow(/gold/);
  });
});
it('separates exact label lookup from incomplete semantic gold and confounded layout', () => {
  expect(classifyLegacyQuestion('figure-03-a-concept', 'concept')).toMatchObject({ primary: false, status: 'incomplete-gold' });
  expect(classifyLegacyQuestion('figure-07-a-concept', 'concept')).toMatchObject({ primary: false, status: 'diagram-content-erratum' });
  expect(classifyLegacyQuestion('other', 'layout').primary).toBe(false);
  expect(classifyLegacyQuestion('other', 'literal').primary).toBe(true);
});
it('makes tie expectation invariant to ID order and distinguishes recall from hit', () => {
  const tied = [{ evidenceId: 'a', score: 1 }, { evidenceId: 'b', score: 1 }];
  expect(expectedHit1(tied, ['b'])).toBe(0.5);
  expect(expectedHit1([...tied].reverse(), ['b'])).toBe(0.5);
  expect(expectedHit1([], ['b'])).toBe(0); expect(expectedHit1(tied, [])).toBeNull();
  expect(rankingMetrics(['a', 'c'], ['a', 'b'])).toMatchObject({ hit1: 1, recall1: 0.5 });
});
it('rejects incomplete rows and zero raw FP32 vectors even with a matching file hash', () => {
  const metadata = ControlEncoding.parse(readJSON(resolve(root, 'artifacts/encoding.json')));
  const skipped = structuredClone(metadata); skipped.passes[0]!.rows.pop();
  expect(() => readControlVectors(root, skipped)).toThrow(/Incomplete/);
  mkdirSync(resolve(root, 'runs'), { recursive: true });
  const dir = mkdtempSync(resolve(root, 'runs/binary-'));
  try {
    const bad = structuredClone(metadata), original = readFileSync(resolve(root, bad.passes[0]!.file));
    const bytes = Buffer.from(original); bytes.fill(0, 0, 512 * 4);
    const file = join(dir, 'zero.f32'); writeFileSync(file, bytes);
    bad.passes[0]!.file = relative(root, file); bad.passes[0]!.sha256 = sha(bytes);
    expect(() => readControlVectors(root, bad)).toThrow(/zero/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('replays the same image order and metrics without loading a model or invoking OCR', () => {
  const out = mkdtempSync(join(tmpdir(), 'review-replay-'));
  try {
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/images/review.ts', '--out', out], { cwd: corpus, encoding: 'utf8' });
    expect(child.status, child.stderr).toBe(0);
    const rows = (path: string) => readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const before = rows(resolve(root, 'results/2026-10-22/records.jsonl')), after = rows(join(out, 'records.jsonl'));
    const stable = (records: any[]) => records.map(({ searchMs, ranking, ...row }) => ({ ...row, ranking: ranking.map((r: any) => r.evidenceId) }));
    expect(stable(after)).toEqual(stable(before)); expect(after).toHaveLength(648);
    after.forEach((row, index) => row.ranking.forEach((r: any, i: number) => {
      const expected = before[index].ranking[i].score;
      expect(Math.abs(r.score - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
    }));
    const audit: any = readJSON(join(out, 'gold-audit.json'));
    expect(audit.rows.filter((r: any) => r.primary)).toHaveLength(24);
    const summary: any = readJSON(join(out, 'summary.json'));
    const row = summary.summary.find((r: any) => r.arm === 'ocr' && r.kind === 'layout');
    expect(row.repetitions.every((r: any) => r.withinHit1 === 0.5)).toBe(true);
  } finally { rmSync(out, { recursive: true, force: true }); }
}, 20000);
