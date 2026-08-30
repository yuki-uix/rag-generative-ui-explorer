// @vitest-environment jsdom
/**
 * Behaviour the renderer owns, per `docs/ARCHITECTURE.md` and #18. These assert
 * what a reader or a screen reader can actually perceive, not that a component
 * returned something.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_TYPES } from '@rgux/contracts';
import { KnowledgeCard } from '../components/cards/knowledge-card.js';
import { CardEmpty, CardError, CardIncomplete, CardLoading } from '../components/cards/states.js';
import { CARD_FIXTURES } from '../fixtures/cards.js';

afterEach(cleanup);

describe('the card dispatcher', () => {
  // Derived from the union, so a sixth card type fails here automatically
  // instead of needing someone to remember this file.
  it.each(CARD_TYPES)('renders a component for %s', (type) => {
    const card = CARD_FIXTURES.find((fixture) => fixture.type === type);
    expect(card, `no fixture for ${type}`).toBeDefined();

    const { container } = render(<KnowledgeCard card={card!} />);
    expect(container.querySelector(`[data-card-type="${type}"]`)).not.toBeNull();
  });

  it('renders the card title as a heading', () => {
    render(<KnowledgeCard card={CARD_FIXTURES[0]!} />);
    expect(screen.getByRole('heading', { name: 'Sparse retrieval' })).toBeDefined();
  });
});

describe('grounding mode is perceivable, not just coloured', () => {
  const procedure = CARD_FIXTURES.find((card) => card.type === 'procedure')!;

  it('marks inferred text differently from extractive text', () => {
    const { container } = render(<KnowledgeCard card={procedure} />);
    const modes = [...container.querySelectorAll('[data-grounding-mode]')].map((node) =>
      node.getAttribute('data-grounding-mode'),
    );

    expect(modes).toContain('inferred');
    expect(modes).toContain('extractive');
  });

  it('says which mode it is in text, so colour is not the only signal', () => {
    render(<KnowledgeCard card={procedure} />);
    expect(screen.getByText(/Inferred, not stated in the corpus/)).toBeDefined();
    expect(screen.getAllByText(/Inferred, 2 sources/).length).toBeGreaterThan(0);
  });

  it('puts every evidence identifier in the accessible name of its field', () => {
    render(<KnowledgeCard card={procedure} />);
    expect(
      screen.getByText(
        /rag\/reranking#reranking-cannot-raise-recall#0-8f587090, rag\/retrieval-metrics#recall-k#0-49dcb28d/,
      ),
    ).toBeDefined();
  });
});

describe('the comparison card', () => {
  const comparison = CARD_FIXTURES.find((card) => card.type === 'comparison')!;

  it('uses real table semantics with headers associated to cells', () => {
    render(<KnowledgeCard card={comparison} />);
    const table = screen.getByRole('table');

    const columnHeaders = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(columnHeaders).toEqual(['Dimension', 'Sparse (BM25)', 'Dense (dual encoder)']);

    const rowHeaders = within(table).getAllByRole('rowheader');
    expect(rowHeaders.length).toBe(comparison.rows.length);
    for (const header of rowHeaders) expect(header.getAttribute('scope')).toBe('row');
  });
});

describe('the evidence card', () => {
  const evidence = CARD_FIXTURES.find((card) => card.type === 'evidence')!;

  it('shows the identifier and no passage text when nothing resolves it', () => {
    render(<KnowledgeCard card={evidence} />);

    expect(screen.getByText('rag/sparse-retrieval#body#0-d441a718')).toBeDefined();
    expect(screen.getAllByText(/Passage not loaded/).length).toBe(evidence.evidenceIds.length);
  });

  it('renders passage text only from what the resolver returns', () => {
    render(
      <KnowledgeCard
        card={evidence}
        resolveEvidence={(id) =>
          id === 'rag/retrieval-metrics#recall-k#0-49dcb28d'
            ? {
                id,
                documentId: 'rag/retrieval-metrics',
                documentTitle: 'Retrieval metrics',
                section: 'Recall@K',
                text: 'The fraction of relevant documents that appear in the top K results.',
                retrievalScore: 0,
                metadata: { category: 'rag' },
              }
            : undefined
        }
      />,
    );

    expect(
      screen.getByText('The fraction of relevant documents that appear in the top K results.'),
    ).toBeDefined();
    expect(screen.getAllByText(/Passage not loaded/).length).toBe(2);
  });
});

describe('the states the renderer owns', () => {
  it('announces loading without relying on the animation', () => {
    render(<CardLoading />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Building cards')).toBeDefined();
  });

  it('renders empty and error distinguishably', () => {
    const { unmount } = render(<CardEmpty />);
    expect(screen.getByText('No cards to show.')).toBeDefined();
    unmount();

    render(<CardError message="The response failed validation." />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  // The two incomplete reasons must not read the same: one says the corpus had
  // nothing, the other says it disagreed with itself.
  it('distinguishes missing from conflicting evidence', () => {
    const { container: missing, unmount } = render(<CardIncomplete reason="missing" />);
    const missingText = missing.textContent ?? '';
    expect(missing.querySelector('[data-incomplete-reason="missing"]')).not.toBeNull();
    unmount();

    const { container: conflicting } = render(<CardIncomplete reason="conflicting" />);
    const conflictingText = conflicting.textContent ?? '';
    expect(conflicting.querySelector('[data-incomplete-reason="conflicting"]')).not.toBeNull();

    expect(missingText).not.toBe(conflictingText);
    expect(conflictingText).toMatch(/disagree/i);
  });
});
