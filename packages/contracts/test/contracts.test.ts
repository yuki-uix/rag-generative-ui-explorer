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

  /**
   * Coverage expressed as a test rather than as a checklist. The valid fixtures
   * previously exercised only two of five card types; nothing failed, because
   * nothing was asking. Deriving the requirement from CARD_TYPES means a new
   * card type without a fixture fails here instead of shipping untested.
   */
  it('has a valid fixture exercising every card type', () => {
    const exercised = new Set(
      loadFixtures('valid').flatMap(([, fixture]) =>
        (fixture as { cards: Array<{ type: string }> }).cards.map((card) => card.type),
      ),
    );
    expect([...CARD_TYPES].filter((type) => !exercised.has(type))).toEqual([]);
  });

  it('has a valid fixture exercising every action kind', () => {
    const exercised = new Set(
      loadFixtures('valid').flatMap(([, fixture]) =>
        (fixture as { suggestedActions: Array<{ action: string }> }).suggestedActions.map(
          (action) => action.action,
        ),
      ),
    );
    expect([...ACTION_KINDS].filter((kind) => !exercised.has(kind))).toEqual([]);
  });

  it('has a valid fixture exercising every grounding mode', () => {
    const modes = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (typeof record.mode === 'string' && Array.isArray(record.evidenceIds)) {
          modes.add(record.mode);
        }
        Object.values(record).forEach(walk);
      }
    };
    loadFixtures('valid').forEach(([, fixture]) => walk(fixture));
    expect([...modes].sort()).toEqual(['extractive', 'inferred', 'summarized']);
  });

  it('enumerates exactly the three approved actions', () => {
    expect([...ACTION_KINDS].sort()).toEqual([
      'add_to_comparison',
      'explain_further',
      'show_sources',
    ]);
  });
});
