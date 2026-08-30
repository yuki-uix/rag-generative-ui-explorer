/**
 * The gate #49 needed and did not have.
 *
 * That PR rendered cards citing real note titles with sections and quotations
 * that exist nowhere in the corpus — the most convincing kind of fabrication,
 * because a casual check of the title passes. Every fixture identifier here is
 * resolved against the corpus the retriever actually indexes, so a made-up
 * citation fails the build instead of shipping.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_TYPES, KnowledgeCard } from '@rgux/contracts';
import { ingest } from '@rgux/corpus';
import { CARD_FIXTURES } from '../fixtures/cards.js';

const knowledgeRoot = resolve(import.meta.dirname, '../../../knowledge');
const { evidence, errors } = ingest(knowledgeRoot);
const corpusIds = new Set(evidence.map((item) => item.id));

/** Every evidence identifier a fixture cites, wherever it appears in the card. */
function citedIds(card: (typeof CARD_FIXTURES)[number]): string[] {
  switch (card.type) {
    case 'definition':
      return [card.definition, ...card.keyPoints].flatMap((field) => field.evidenceIds);
    case 'comparison':
      return card.rows.flatMap((row) => row.values.flatMap((value) => value.evidenceIds));
    case 'mechanism':
      return card.stages.flatMap((stage) => stage.description.evidenceIds);
    case 'procedure':
      return card.steps.flatMap((step) => step.instruction.evidenceIds);
    case 'evidence':
      return [...card.evidenceIds];
  }
}

/**
 * Whitespace and markdown emphasis are normalised away: the corpus is Markdown
 * and a card renders plain text, so `*possible*` and `possible` are the same
 * words. Nothing else is normalised — the point is that the words and their
 * order are the note's.
 */
const normalise = (text: string) => text.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Every grounded field in a fixture, flattened with the card it came from. */
function groundedFields(card: (typeof CARD_FIXTURES)[number]) {
  switch (card.type) {
    case 'definition':
      return [card.definition, ...card.keyPoints].map((field) => ({ card: card.id, field }));
    case 'comparison':
      return card.rows.flatMap((row) => row.values.map((field) => ({ card: card.id, field })));
    case 'mechanism':
      return card.stages.map((stage) => ({ card: card.id, field: stage.description }));
    case 'procedure':
      return card.steps.map((step) => ({ card: card.id, field: step.instruction }));
    case 'evidence':
      return [];
  }
}

describe('card fixtures', () => {
  it('ingests the corpus without errors', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
    expect(corpusIds.size).toBeGreaterThan(0);
  });

  it('every fixture validates against the contract', () => {
    for (const card of CARD_FIXTURES) {
      const result = KnowledgeCard.safeParse(card);
      expect(result.success, `${card.id}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });

  it('cites only evidence that exists in the corpus', () => {
    const missing = CARD_FIXTURES.flatMap((card) =>
      citedIds(card)
        .filter((id) => !corpusIds.has(id))
        .map((id) => `${card.id} cites ${id}`),
    );

    expect(missing).toEqual([]);
  });

  /**
   * The gate that catches a true sentence attributed to the wrong passage.
   *
   * Checking that an identifier exists is not enough: it passed while a
   * sentence from the dense-retrieval note was cited to the sparse-retrieval
   * one. `extractive` claims the words are the cited passage's, so that claim
   * is now checked rather than trusted, and a field whose text was reworded has
   * to say `summarized` instead.
   */
  it('backs every extractive field with the passage it cites, word for word', () => {
    const byId = new Map(evidence.map((item) => [item.id, item.text]));
    const wrong = CARD_FIXTURES.flatMap(groundedFields)
      .filter(({ field }) => field.mode === 'extractive')
      .filter(
        ({ field }) =>
          !field.evidenceIds.some((id) =>
            normalise(byId.get(id) ?? '').includes(normalise(field.text)),
          ),
      )
      .map(({ card, field }) => `${card}: "${field.text}" is not in ${field.evidenceIds.join(', ')}`);

    expect(wrong).toEqual([]);
  });

  it('covers every card type, read from the union rather than listed here', () => {
    const covered = new Set(CARD_FIXTURES.map((card) => card.type));
    const uncovered = CARD_TYPES.filter((type) => !covered.has(type));

    expect(uncovered).toEqual([]);
  });

  it('exercises all three grounding modes, so the renderer distinction is testable', () => {
    const modes = new Set(
      CARD_FIXTURES.flatMap((card) => {
        switch (card.type) {
          case 'definition':
            return [card.definition, ...card.keyPoints].map((field) => field.mode);
          case 'comparison':
            return card.rows.flatMap((row) => row.values.map((value) => value.mode));
          case 'mechanism':
            return card.stages.map((stage) => stage.description.mode);
          case 'procedure':
            return card.steps.map((step) => step.instruction.mode);
          case 'evidence':
            return [];
        }
      }),
    );

    expect([...modes].sort()).toEqual(['extractive', 'inferred', 'summarized']);
  });
});
