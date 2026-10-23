import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewInventory, summarizeSemanticReview, type SemanticReview } from '../src/experiment/semantic-review.js';
import type { StudyRecord } from '../src/experiment/study.js';

const root = resolve(import.meta.dirname, '../../..');
const records = readFileSync(resolve(root, 'eval/framework/results/f5-pilot-2026-10-21/records.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) as StudyRecord[];
const hash = 'a'.repeat(64);
function fixture(): SemanticReview {
  return {
    version: 'framework-semantic-review-1', recordsSha256: hash, reviewedAt: '2026-10-21T04:30:00Z',
    reviewer: { kind: 'single-ai-evidence-audit', identity: 'Synthetic test fixture, not a real review', modelPin: null, blinded: false, independentHuman: false, limitations: 'Fixture judgment for validation tests only.' },
    fields: reviewInventory(records).map((field) => ({
      recordKey: field.recordKey, path: field.path, claim: field.text, fieldSha256: field.fieldSha256, verdict: 'supported', rationale: 'Synthetic fixture assertion.',
      citations: field.evidence.map((source) => ({ evidenceId: source.id, verdict: 'supports', quote: source.text.slice(0, 30), rationale: 'Synthetic citation assertion.' })),
    })),
    responses: records.map((record) => ({ recordKey: `${record.repetition}/${record.observed.question.id}/${record.arm}`,
      verdict: record.observed.result?.metadata.incomplete ? 'incomplete-justified' : 'adequate-minimal', rationale: 'Synthetic response assertion.' })),
  };
}

describe('semantic audit provenance', () => {
  it('requires all fields and all response decisions, while keeping empty denominators unknown', () => {
    const review = fixture();
    const summary = summarizeSemanticReview(records, review, hash);
    expect(summary.reviewedFields).toBe(reviewInventory(records).length);
    expect(summary.citationPrecision).toBe(1);
    expect(summary.unsupportedClaimRate).toBe(0);
    const missing = records.filter((record) => record.observed.question.id === 'ins-001');
    const subset = { ...review, fields: [], responses: review.responses.filter((response) => response.recordKey.includes('/ins-001/')) };
    expect(summarizeSemanticReview(missing, subset, hash).citationPrecision).toBeNull();
    expect(summarizeSemanticReview(missing, subset, hash).unsupportedClaimRate).toBeNull();
  });

  it('rejects stale records, skipped fields, duplicate judgments, wrong claims and invented support quotes', () => {
    expect(() => summarizeSemanticReview(records, fixture(), 'b'.repeat(64))).toThrow(/different raw/);
    for (const change of [
      (r: SemanticReview) => { r.fields.pop(); },
      (r: SemanticReview) => { r.fields.push(r.fields[0]!); },
      (r: SemanticReview) => { r.fields[0]!.fieldSha256 = '0'.repeat(64); },
      (r: SemanticReview) => { r.fields[0]!.claim = 'Changed claim'; },
      (r: SemanticReview) => { r.fields[0]!.citations[0]!.quote = 'This was never in the cited passage'; },
      (r: SemanticReview) => { r.fields[0]!.citations[0]!.quote = ''; },
      (r: SemanticReview) => { r.fields[0]!.citations = []; },
      (r: SemanticReview) => { r.responses.pop(); },
      (r: SemanticReview) => { r.responses[0]!.verdict = 'rejected-not-rendered'; },
    ]) {
      const review = fixture(); change(review);
      expect(() => summarizeSemanticReview(records, review, hash)).toThrow();
    }
  });

  it('keeps partial support visible instead of counting a related passage as full entailment', () => {
    const review = fixture();
    review.fields[0]!.verdict = 'partial';
    review.fields[0]!.citations[0]!.verdict = 'partial';
    const summary = summarizeSemanticReview(records, review, hash);
    expect(summary.citationPrecision).toBeLessThan(1);
    expect(summary.unsupportedClaimRate).toBe(0);
    expect(summary.notFullySupportedRate).toBeGreaterThan(0);
    expect(summary.verdicts['partial']).toBe(1);
  });
});
