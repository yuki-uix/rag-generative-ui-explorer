/**
 * The point of this test is the workspace link, not the schema — the schema has
 * its own suite in @rgux/contracts. If the app cannot import and run a contract,
 * every component built on top of it in #18 would fail later and further away.
 */
import { describe, expect, it } from 'vitest';
import { CARD_TYPES, KnowledgeCard } from '@rgux/contracts';

describe('the app can reach @rgux/contracts', () => {
  it('parses a card through the real schema', () => {
    const card = {
      id: 'card-1',
      type: 'definition',
      title: 'Sparse retrieval',
      definition: {
        text: 'Scores a document by the query terms it literally contains.',
        mode: 'extractive',
        evidenceIds: ['rag/sparse-retrieval#body#0-d441a718'],
      },
      keyPoints: [
        {
          text: 'Matching is a lookup in an inverted index.',
          mode: 'extractive',
          evidenceIds: ['rag/sparse-retrieval#body#0-d441a718'],
        },
      ],
    };

    expect(KnowledgeCard.parse(card).type).toBe('definition');
  });

  it('rejects a card whose factual field carries no evidence', () => {
    const ungrounded = {
      id: 'card-2',
      type: 'definition',
      title: 'Sparse retrieval',
      definition: { text: 'Something.', mode: 'inferred', evidenceIds: [] },
      keyPoints: [{ text: 'Something else.', mode: 'inferred', evidenceIds: [] }],
    };

    expect(KnowledgeCard.safeParse(ungrounded).success).toBe(false);
  });

  it('reads the card vocabulary from the union rather than a literal list', () => {
    expect([...CARD_TYPES].sort()).toEqual([
      'comparison',
      'definition',
      'evidence',
      'mechanism',
      'procedure',
    ]);
  });
});
