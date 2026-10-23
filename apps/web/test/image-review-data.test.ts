import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/image-review.json';
import {
  buildImageReviewData,
  generateImageReview,
  imageReviewPublicFiles,
} from '../scripts/generate-image-review.js';
import type {
  ImageReviewData,
  ImageReviewRow,
} from '../lib/image-review-types.js';

const data = fixture as ImageReviewData;
const repository = resolve(import.meta.dirname, '../../..');
const control = data.datasets.find((dataset) => dataset.id === 'control')!;
const legacy = data.datasets.find((dataset) => dataset.id === 'legacy')!;
const row = (questionId: string) =>
  control.rows.find(
    (result) => result.questionId === questionId && result.arm === 'clip',
  )!;

describe('the sealed image experiment browser projection', () => {
  it('regenerates byte-identical data and public images after verifying upstream seals', () => {
    expect(buildImageReviewData()).toEqual(data);
    expect(generateImageReview(true)).toEqual({
      datasets: 2,
      questions: 106,
      images: 48,
    });
    expect(imageReviewPublicFiles(data).size).toBe(48);
    expect(data.provenance).toMatchObject({
      repetitions: 3,
      displayedRepetition: 1,
      providerApiCalls: 0,
      independentlyAdjudicated: false,
    });
  });

  it('preserves every fixed question and each real pass-one arm, including empty negative rankings', () => {
    expect(control.figures).toHaveLength(24);
    expect(legacy.figures).toHaveLength(24);
    expect(control.questions).toHaveLength(54);
    expect(legacy.questions).toHaveLength(52);
    expect(control.rows).toHaveLength(216);
    expect(legacy.rows).toHaveLength(156);
    for (const dataset of data.datasets) {
      const ids = new Set(dataset.figures.map((figure) => figure.id));
      for (const question of dataset.questions) {
        expect(question.gold.every((id) => ids.has(id))).toBe(true);
        expect(
          new Set(
            dataset.rows
              .filter((result) => result.questionId === question.id)
              .map((result) => result.arm),
          ).size,
        ).toBe(dataset.id === 'control' ? 4 : 3);
      }
      for (const result of dataset.rows) {
        expect(result.repetition).toBe(1);
        expect(
          new Set(result.ranking.map((rank) => rank.evidenceId)).size,
        ).toBe(result.ranking.length);
        expect(
          result.ranking.every(
            (rank) => ids.has(rank.evidenceId) && Number.isFinite(rank.score),
          ),
        ).toBe(true);
      }
    }
    expect(
      legacy.rows.find(
        (result) => result.questionId === 'negative-3' && result.arm === 'ocr',
      )?.ranking,
    ).toEqual([]);
    expect(
      legacy.rows
        .filter((result) => result.questionId.startsWith('negative-'))
        .every(
          (result) => result.metrics === null && result.expectedHit1 === null,
        ),
    ).toBe(true);
  });

  it('copies full observed ranks and scores instead of rerunning or rounding retrieval', () => {
    for (const dataset of data.datasets) {
      const path =
        dataset.id === 'control'
          ? 'eval/images-review/results/2026-10-22/records.jsonl'
          : 'eval/images/results/2026-10-21/records.jsonl';
      const observed = readFileSync(resolve(repository, path), 'utf8')
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as Omit<ImageReviewRow, 'arm'> & { arm: string },
        );
      for (const result of dataset.rows) {
        const original = observed.find(
          (value) =>
            value.repetition === 1 &&
            value.questionId === result.questionId &&
            (value.arm === 'text' ? 'source-text' : value.arm) === result.arm,
        )!;
        expect(original).toBeDefined();
        expect(result.ranking).toEqual(original.ranking);
        expect(result.metrics).toEqual(original.metrics);
      }
    }
  });

  it('retains gold limitations and the fully crossed no-word-shortcut controls', () => {
    expect(
      legacy.questions.filter((question) => question.primary),
    ).toHaveLength(24);
    expect(
      legacy.questions
        .filter((question) => question.primary)
        .every((question) => question.kind === 'literal'),
    ).toBe(true);
    expect(
      legacy.questions.find(
        (question) => question.id === 'figure-03-a-concept',
      ),
    ).toMatchObject({
      primary: false,
      status: 'incomplete-gold',
      gold: ['figure-03-a'],
      knownAlternatives: ['figure-03-a', 'figure-03-b'],
    });
    expect(
      legacy.questions
        .filter((question) => question.kind === 'layout')
        .every(
          (question) =>
            !question.primary && question.status === 'confounded-layout',
        ),
    ).toBe(true);
    expect(
      legacy.figures.find((figure) => figure.id === 'figure-07-a')?.warning,
    ).toBeTruthy();
    for (const family of new Set(
      control.figures.map((figure) => figure.family),
    )) {
      const figures = control.figures.filter(
        (figure) => figure.family === family,
      );
      expect(
        new Set(
          figures.map(
            (figure) =>
              `${figure.attributes.color}/${figure.attributes.layout}`,
          ),
        ).size,
      ).toBe(4);
      expect(
        new Set(figures.map((figure) => JSON.stringify(figure.visibleText)))
          .size,
      ).toBe(1);
      expect(new Set(figures.map((figure) => figure.sourceText)).size).toBe(1);
    }
    expect(
      control.summary.find(
        (value) => value.arm === 'clip' && value.kind === 'layout',
      ),
    ).toMatchObject({ questions: 12, fullHit1: 0.25, withinHit1: 7 / 12 });
  });

  it('supports the three reported failures with actual global and conditional rankings', () => {
    expect(control.failureCases.map((value) => value.questionId)).toEqual([
      'doc-02-diamond',
      'doc-10-column',
      'doc-02-blue',
    ]);
    expect(row('doc-02-diamond')).toMatchObject({
      metrics: { hit1: 0 },
      withinHit1: 1,
      sourceHit1: 0,
    });
    expect(row('doc-02-diamond').ranking[0]?.evidenceId).toBe('control-05-4');
    expect(row('doc-10-column').withinHit1).toBe(0);
    expect(row('doc-02-blue').ranking[0]?.evidenceId).toBe('control-01-4');
    expect(
      control.figures.find(
        (figure) => figure.id === row('doc-02-blue').ranking[0]?.evidenceId,
      )?.attributes.color,
    ).toBe('orange');
  });
});
