import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_TYPES } from '@rgux/contracts';
import {
  parseEvalSet,
  resolveGoldenEvidence,
  EvalQuestion,
  uncoveredSections,
  type EvalSet,
} from '../src/eval-set.js';
import { buildManifest } from '../src/manifest.js';
import { parseNote } from '../src/note.js';
import { chunkNote } from '../src/chunks.js';
import { KNOWLEDGE_DOMAINS } from '../src/domain.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

const question = {
  id: 'rag-001',
  question: 'What is retrieval-augmented generation?',
  domain: 'rag',
  expectedCardTypes: ['definition'],
  goldenEvidenceIds: ['rag/rag-motivation#body#0-a74c2bc6'],
  expectInsufficient: false,
};

describe('question schema', () => {
  it('accepts a well-formed question', () => {
    expect(EvalQuestion.safeParse(question).success).toBe(true);
  });

  /**
   * Both directions matter. An answerable question with no golden evidence
   * silently drops out of the recall denominator; an unanswerable one carrying
   * evidence contradicts the label it was written to test.
   */
  it('requires golden evidence unless the question is marked unanswerable', () => {
    expect(
      EvalQuestion.safeParse({ ...question, goldenEvidenceIds: [] }).success,
    ).toBe(false);
    expect(
      EvalQuestion.safeParse({ ...question, goldenEvidenceIds: [], expectInsufficient: true })
        .success,
    ).toBe(true);
  });

  it('rejects an unanswerable question that carries golden evidence', () => {
    expect(
      EvalQuestion.safeParse({ ...question, expectInsufficient: true }).success,
    ).toBe(false);
  });

  it('rejects a malformed evidence identifier', () => {
    expect(
      EvalQuestion.safeParse({
        ...question,
        goldenEvidenceIds: ['0000000000000000000000000000000000000000'],
      }).success,
    ).toBe(false);
  });

  it('rejects a duplicate golden identifier', () => {
    expect(
      EvalQuestion.safeParse({
        ...question,
        goldenEvidenceIds: [...question.goldenEvidenceIds, ...question.goldenEvidenceIds],
      }).success,
    ).toBe(false);
  });

  it('rejects a card type outside the approved five', () => {
    expect(
      EvalQuestion.safeParse({ ...question, expectedCardTypes: ['timeline'] }).success,
    ).toBe(false);
    expect(EvalQuestion.safeParse({ ...question, expectedCardTypes: [] }).success).toBe(false);
  });
});

describe('resolveGoldenEvidence', () => {
  const set: EvalSet = {
    header: {
      corpusVersion: 'corpus-0123456789ab',
      chunking: { boundary: 'h2-section', maxChunkChars: 1200 },
      questionCount: 1,
      labelledBy: 'someone',
      labelledOn: '2026-08-29',
    },
    questions: [EvalQuestion.parse(question)],
  };

  it('reports an identifier that resolves to nothing', () => {
    const report = resolveGoldenEvidence(set, ['rag/other#body#0-aaaaaaaa'], 'corpus-0123456789ab');
    expect(report.unresolved).toEqual([
      { questionId: 'rag-001', evidenceId: 'rag/rag-motivation#body#0-a74c2bc6' },
    ]);
  });

  it('reports a corpus version the labels were not written against', () => {
    const report = resolveGoldenEvidence(set, question.goldenEvidenceIds, 'corpus-ffffffffffff');
    expect(report.corpusMismatch).toEqual({
      labelled: 'corpus-0123456789ab',
      actual: 'corpus-ffffffffffff',
    });
  });

  it('reports notes no question draws on', () => {
    const report = resolveGoldenEvidence(
      set,
      [...question.goldenEvidenceIds, 'rag/unused#body#0-bbbbbbbb'],
      'corpus-0123456789ab',
    );
    expect(report.untouchedDocuments).toEqual(['rag/unused']);
  });
});

/**
 * Runs against the committed question set and the real chunk set. This is the
 * acceptance criterion itself: a golden identifier that is well-formed but
 * resolves to nothing would pass every shape check while silently removing its
 * question from the recall denominator.
 */
describe('the committed question set', () => {
  const { manifest, errors } = buildManifest(resolve(repoRoot, 'knowledge'));
  const chunkIds = manifest.documents.flatMap((document) =>
    chunkNote(
      document.documentId,
      parseNote(document.path, readFileSync(resolve(repoRoot, document.path), 'utf8')).body,
    ).map((chunk) => chunk.evidenceId),
  );
  const { set, problems } = parseEvalSet(
    readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'),
  );

  it('parses without problems', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
    expect(problems).toEqual([]);
    expect(set).toBeDefined();
  });

  it('holds 60 questions labelled against the current corpus', () => {
    expect(set!.questions).toHaveLength(60);
    expect(set!.header.questionCount).toBe(60);
    expect(set!.header.corpusVersion).toBe(manifest.corpusVersion);
  });

  it('resolves every golden identifier against the real chunk set', () => {
    const report = resolveGoldenEvidence(set!, chunkIds, manifest.corpusVersion);
    expect(report.unresolved).toEqual([]);
    expect(report.corpusMismatch).toBeUndefined();
  });

  it('draws on every note, so no part of the corpus is unmeasured', () => {
    const report = resolveGoldenEvidence(set!, chunkIds, manifest.corpusVersion);
    expect(report.untouchedDocuments).toEqual([]);
  });

  it('distributes questions across the three domains in proportion to the corpus', () => {
    for (const domain of KNOWLEDGE_DOMAINS) {
      const notes = manifest.documents.filter((d) => d.domain === domain).length;
      const questions = set!.questions.filter((q) => q.domain === domain).length;
      const expected = (notes / manifest.documentCount) * set!.questions.length;
      expect(Math.abs(questions - expected)).toBeLessThanOrEqual(2);
    }
  });

  it('includes unanswerable questions, without which detection cannot be scored', () => {
    const unanswerable = set!.questions.filter((q) => q.expectInsufficient);
    expect(unanswerable.length).toBeGreaterThanOrEqual(5);
    for (const q of unanswerable) expect(q.goldenEvidenceIds).toEqual([]);
  });

  it('exercises every approved card type in its expected labels', () => {
    const labelled = new Set(set!.questions.flatMap((q) => q.expectedCardTypes));
    expect([...CARD_TYPES].filter((type) => !labelled.has(type))).toEqual([]);
  });
});

describe('section-level coverage', () => {
  const { manifest } = buildManifest(resolve(repoRoot, 'knowledge'));
  const chunkIds = manifest.documents.flatMap((document) =>
    chunkNote(
      document.documentId,
      parseNote(document.path, readFileSync(resolve(repoRoot, document.path), 'utf8')).body,
    ).map((chunk) => chunk.evidenceId),
  );
  const { set } = parseEvalSet(readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'));
  const coverage = uncoveredSections(set!, chunkIds);

  /**
   * The note-level check this replaces stayed green while a note's central
   * argument went unmeasured, because other sections of that note were cited.
   */
  it('leaves no section unmeasured without a recorded reason', () => {
    expect(coverage.unexplained.map((entry) => `${entry.documentId}#${entry.section}`)).toEqual([]);
  });

  /** An exemption nobody needs is a standing permission, not a judgement. */
  it('carries no exemption for a section that is measured after all', () => {
    expect(coverage.staleExemptions).toEqual([]);
  });

  it('gives every unmeasured section a reason', () => {
    for (const entry of coverage.unmeasured) expect(entry.exemptReason).toBeTruthy();
  });
});
