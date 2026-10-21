import { z } from 'zod';
import { KnowledgeUIResponse, gate } from '@rgux/contracts';
import { createHash } from 'node:crypto';
import type { AuditRecord } from './audit-records.js';
import { dispersion } from './study.js';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const Verdict = z.enum(['supported', 'partial', 'unsupported', 'contradicted', 'uncertain']);
export const SemanticReview = z.strictObject({
  version: z.literal('framework-semantic-review-1'), recordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedAt: z.iso.datetime(),
  reviewer: z.strictObject({
    kind: z.literal('single-ai-evidence-audit'), identity: z.string().min(1), modelPin: z.string().nullable(),
    blinded: z.literal(false), independentHuman: z.literal(false), limitations: z.string().min(1),
  }),
  fields: z.array(z.strictObject({
    recordKey: z.string(), path: z.string(), claim: z.string().min(1), fieldSha256: z.string().regex(/^[a-f0-9]{64}$/),
    verdict: Verdict, rationale: z.string().min(1),
    citations: z.array(z.strictObject({
      evidenceId: z.string(), verdict: z.enum(['supports', 'partial', 'irrelevant', 'contradicts', 'uncertain']),
      quote: z.string(), rationale: z.string().min(1),
    })),
  })),
  responses: z.array(z.strictObject({
    recordKey: z.string(),
    verdict: z.enum(['adequate-minimal', 'answers-with-scope-overstatement', 'incomplete-justified', 'overcautious-partial-answer-available', 'nonresponsive', 'rejected-not-rendered', 'uncertain']),
    rationale: z.string().min(1),
  })),
});
export type SemanticReview = z.infer<typeof SemanticReview>;

/** Review only validated renderable fields, and bind the judgment to the exact
 * card context (including table headings), text and evidence IDs. */
export function reviewInventory(records: readonly AuditRecord[]) {
  return records.flatMap((record) => {
    const observed = record.observed;
    const recordKey = `${record.repetition}/${observed.question.id}/${record.arm}`;
    if (observed.result === null) return [];
    const result = KnowledgeUIResponse.parse(observed.result);
    if (result.query !== observed.question.question) throw new Error('Reviewed result answers a different question.');
    if (JSON.stringify(result.evidence) !== JSON.stringify(observed.evidence)) throw new Error('Result and retrieved evidence disagree.');
    const checked = gate(result.cards, result.evidence);
    if (checked.failures.length || checked.cards.length !== result.cards.length) throw new Error('Saved result fails the current output gate.');
    const fields: { recordKey: string; path: string; fieldSha256: string; text: string; mode: string; evidenceIds: string[]; card: unknown; evidence: { id: string; text: string }[] }[] = [];
    const walk = (value: unknown, path: string, card: unknown) => {
      if (value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${path}/${index}`, card)); return; }
      const node = value as Record<string, unknown>;
      if (typeof node['text'] === 'string' && typeof node['mode'] === 'string' && Array.isArray(node['evidenceIds'])) {
        const ids = node['evidenceIds'] as string[];
        fields.push({ recordKey, path, fieldSha256: sha256(JSON.stringify({ card, path, field: node })),
          text: node['text'], mode: node['mode'], evidenceIds: ids, card,
          evidence: ids.map((id) => { const item = result.evidence.find((evidence) => evidence.id === id); if (!item) throw new Error('Unknown reviewed citation.'); return { id, text: item.text }; }),
        });
        return;
      }
      for (const [key, child] of Object.entries(node)) walk(child, `${path}/${key}`, card);
    };
    result.cards.forEach((card, index) => walk(card, `/cards/${index}`, card));
    return fields;
  });
}

export function summarizeSemanticReview(records: readonly AuditRecord[], review: SemanticReview, recordsSha256: string) {
  SemanticReview.parse(review);
  if (review.recordsSha256 !== recordsSha256) throw new Error('Review is bound to different raw records.');
  const inventory = reviewInventory(records);
  const keys = new Set<string>();
  for (const item of review.fields) {
    const key = `${item.recordKey}:${item.path}`;
    if (keys.has(key)) throw new Error('Duplicate field judgment.'); keys.add(key);
    const field = inventory.find((field) => field.recordKey === item.recordKey && field.path === item.path);
    if (!field || field.fieldSha256 !== item.fieldSha256 || item.claim !== field.text) throw new Error('Field judgment does not match the saved card.');
    if (new Set(item.citations.map((citation) => citation.evidenceId)).size !== item.citations.length
      || item.citations.length !== field.evidenceIds.length
      || item.citations.some((citation) => !field.evidenceIds.includes(citation.evidenceId))) throw new Error('Review must cover every citation exactly once.');
    for (const citation of item.citations) {
      const source = field.evidence.find((source) => source.id === citation.evidenceId)!;
      // A quote is provenance evidence, never an automatic semantic judgment.
      if (citation.quote && !source.text.replace(/\s+/g, ' ').includes(citation.quote.replace(/\s+/g, ' '))) throw new Error('Review quote is not in the cited passage.');
      if (['supports', 'partial'].includes(citation.verdict) && !citation.quote.trim()) throw new Error('A support judgment needs an exact source excerpt.');
    }
  }
  if (keys.size !== inventory.length) throw new Error('Semantic review has missing fields.');
  const responseKeys = records.map((record) => `${record.repetition}/${record.observed.question.id}/${record.arm}`);
  if (new Set(responseKeys).size !== responseKeys.length) throw new Error('Duplicate source records.');
  if (review.responses.length !== responseKeys.length || new Set(review.responses.map((response) => response.recordKey)).size !== responseKeys.length
    || review.responses.some((response) => !responseKeys.includes(response.recordKey))) throw new Error('Every response needs exactly one overall judgment.');
  for (const response of review.responses) {
    const record = records[responseKeys.indexOf(response.recordKey)]!;
    if ((record.observed.result === null) !== (response.verdict === 'rejected-not-rendered')) throw new Error('Rejected/rendered review scope disagrees.');
  }
  const summarize = (fields: SemanticReview['fields']) => {
    const citations = fields.flatMap((field) => field.citations);
    const scoredFields = fields.filter((field) => field.verdict !== 'uncertain');
    const scoredCitations = citations.filter((citation) => citation.verdict !== 'uncertain');
    const rates = (n: number, d: number) => d ? n / d : null;
    return {
      reviewedFields: fields.length, scoredFields: scoredFields.length, reviewedCitations: citations.length, scoredCitations: scoredCitations.length,
      citationPrecision: rates(scoredCitations.filter((citation) => citation.verdict === 'supports').length, scoredCitations.length),
      partiallySupportingLinks: scoredCitations.filter((citation) => citation.verdict === 'partial').length,
      unsupportedClaimRate: rates(scoredFields.filter((field) => field.verdict === 'unsupported' || field.verdict === 'contradicted').length, scoredFields.length),
      notFullySupportedRate: rates(scoredFields.filter((field) => field.verdict !== 'supported').length, scoredFields.length),
      verdicts: Object.fromEntries(['supported', 'partial', 'unsupported', 'contradicted', 'uncertain'].map((verdict) => [verdict, fields.filter((field) => field.verdict === verdict).length])),
    };
  };
  return {
    version: 'framework-semantic-summary-1', method: review.reviewer, scope: 'validated GroundedText fields and their citation links; card context inspected, structural strings not counted as separately cited claims',
    ...summarize(review.fields),
    arms: ['native', 'langchain', 'langgraph'].map((arm) => {
      const fields = review.fields.filter((field) => field.recordKey.endsWith('/' + arm));
      const repetitions = [...new Set(records.map((record) => record.repetition))].sort().map((repetition) => ({
        repetition, ...summarize(fields.filter((field) => field.recordKey.startsWith(`${repetition}/`))),
      }));
      return { arm, ...summarize(fields), repetitions,
        dispersion: {
          citationPrecision: dispersion(repetitions.map((row) => row.citationPrecision).filter((rate) => rate !== null)),
          unsupportedClaimRate: dispersion(repetitions.map((row) => row.unsupportedClaimRate).filter((rate) => rate !== null)),
          notFullySupportedRate: dispersion(repetitions.map((row) => row.notFullySupportedRate).filter((rate) => rate !== null)),
        },
      };
    }),
    responseVerdicts: Object.fromEntries([...new Set(review.responses.map((response) => response.verdict))].map((verdict) => [verdict, review.responses.filter((response) => response.verdict === verdict).length])),
  };
}
