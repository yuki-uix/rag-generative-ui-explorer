import { describe, expect, it } from 'vitest';
import { KnowledgeUIResponse, KnowledgeCard, CARD_TYPES, ACTION_KINDS } from '../src/index.js';
import { loadFixtures } from './fixtures.js';

describe('KnowledgeUIResponse', () => {
  it.each(loadFixtures('valid'))('accepts %s', (_name, fixture) => {
    const result = KnowledgeUIResponse.safeParse(fixture);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it.each(loadFixtures('invalid'))('rejects %s', (_name, fixture) => {
    expect(KnowledgeUIResponse.safeParse(fixture).success).toBe(false);
  });
});

describe('card type enumeration', () => {
  it('is derived from the union rather than hand-written', () => {
    expect([...CARD_TYPES].sort()).toEqual([
      'comparison',
      'definition',
      'evidence',
      'mechanism',
      'procedure',
    ]);
  });

  it('covers every member of the union', () => {
    expect(CARD_TYPES).toHaveLength(KnowledgeCard.options.length);
  });

  it('enumerates exactly the three approved actions', () => {
    expect([...ACTION_KINDS].sort()).toEqual([
      'add_to_comparison',
      'explain_further',
      'show_sources',
    ]);
  });
});
