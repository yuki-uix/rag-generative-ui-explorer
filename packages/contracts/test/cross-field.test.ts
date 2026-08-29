/**
 * Rules that JSON Schema cannot express, asserted directly against Zod rather
 * than through a fixture file, so the failure message names the rule.
 */
import { describe, expect, it } from 'vitest';
import { KnowledgeUIResponse, ComparisonCard } from '../src/index.js';
import { loadFixtures } from './fixtures.js';

const byName = Object.fromEntries(loadFixtures('invalid'));

const issuePaths = (fixture: unknown): string[] => {
  const result = KnowledgeUIResponse.safeParse(fixture);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => issue.path.join('.'));
};

describe('comparison row and entity alignment', () => {
  it('rejects a row with fewer values than entities', () => {
    expect(issuePaths(byName['comparison-row-value-mismatch'])).toContainEqual(
      expect.stringContaining('cards.0'),
    );
  });

  it('accepts a row with exactly one value per entity', () => {
    const card = {
      id: 'c1',
      type: 'comparison' as const,
      title: 'Two ways to retrieve',
      entities: ['BM25', 'Embeddings'],
      rows: [
        {
          dimension: 'Strength',
          values: [
            { text: 'Exact terms.', mode: 'summarized' as const, evidenceIds: ['rag/a#body#0-0123abcd'] },
            { text: 'Paraphrase.', mode: 'summarized' as const, evidenceIds: ['rag/a#body#0-0123abcd'] },
          ],
        },
      ],
    };
    expect(ComparisonCard.safeParse(card).success).toBe(true);

    const unbalanced = { ...card, entities: ['BM25', 'Embeddings', 'GraphRAG'] };
    expect(ComparisonCard.safeParse(unbalanced).success).toBe(false);
  });
});

describe('response-level identity rules', () => {
  it('rejects duplicate card ids', () => {
    expect(issuePaths(byName['duplicate-card-ids'])).toContain('cards.1.id');
  });

  it('rejects an action pointing at a card that is not in the response', () => {
    expect(issuePaths(byName['action-references-unknown-card'])).toContain(
      'suggestedActions.0.payload.cardId',
    );
  });
});
