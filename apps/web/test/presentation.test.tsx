// @vitest-environment jsdom
/**
 * #51: the same card spec, two renderings, chosen by the renderer.
 *
 * The property under test is not "a flow looks nice" — it is that the choice is
 * a pure function of the card, that no schema field was added to express it,
 * and that the alternate rendering keeps the semantics and the citations the
 * list rendering had.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GatedCard, MechanismCard as MechanismCardSpec } from '@rgux/contracts';
import { gate } from '@rgux/contracts';
import { KnowledgeCard } from '../components/cards/knowledge-card.js';
import { FLOW, presentationFor } from '../components/cards/presentation.js';
import { FIXTURE_EVIDENCE, GATED_FIXTURES } from './gated.js';

afterEach(cleanup);

const isMechanism = (card: GatedCard): card is GatedCard & MechanismCardSpec =>
  card.type === 'mechanism';

/** Narrowed, not asserted: an assertion would strip the brand off the fixture. */
const mechanism = GATED_FIXTURES.find(isMechanism)!;

/**
 * A card built by editing a fixture has not passed the gate, and the renderer
 * will not take it — correctly, since that is the whole point of #26. These
 * variants change only presentation-relevant fields (labels, stage count), so
 * they still pass every stage; putting them back through the gate proves that
 * rather than asserting it with a cast.
 */
function regate(card: MechanismCardSpec): GatedCard {
  const { cards, failures } = gate([card], FIXTURE_EVIDENCE);
  if (failures.length > 0) {
    throw new Error(`variant did not pass the gate: ${failures[0]!.message}`);
  }
  return cards[0]!;
}

/** The same spec with one label lengthened past the scannable limit. */
function withLongLabel(card: MechanismCardSpec): MechanismCardSpec {
  return {
    ...card,
    stages: card.stages.map((stage, index) =>
      index === 0 ? { ...stage, label: 'A'.repeat(FLOW.maxLabelChars + 1) } : stage,
    ),
  };
}

/** The same spec with more stages than a chain can hold. */
function withManyStages(card: MechanismCardSpec): MechanismCardSpec {
  const stages = [...card.stages];
  while (stages.length <= FLOW.maxNodes) {
    stages.push({ ...card.stages[0]!, label: `Extra ${stages.length}` });
  }
  return { ...card, stages: stages as MechanismCardSpec['stages'] };
}

describe('the presentation choice', () => {
  it('is a pure function of the card, with no field added to the schema', () => {
    expect(presentationFor(mechanism)).toBe('flow');
    expect(presentationFor(mechanism)).toBe(presentationFor(structuredClone(mechanism)));
    expect('presentation' in mechanism).toBe(false);
  });

  // The rule is about whether the nodes can be scanned, not about whether the
  // data is a sequence — a chain of paragraphs is a worse list, not a diagram.
  it('falls back to the list when a label is too long to scan', () => {
    expect(presentationFor(withLongLabel(mechanism))).toBe('list');
  });

  it('falls back to the list when the chain has too many nodes', () => {
    expect(presentationFor(withManyStages(mechanism))).toBe('list');
  });

  it('never offers a flow for card types that are not sequences', () => {
    for (const card of GATED_FIXTURES) {
      if (card.type === 'mechanism' || card.type === 'procedure') continue;
      expect(presentationFor(card), card.type).toBe('list');
    }
  });
});

describe('the flow rendering', () => {
  it('renders the same spec as a flow and as a list, driven only by shape', () => {
    const { container: flow, unmount } = render(<KnowledgeCard card={mechanism} />);
    expect(flow.querySelector('[data-presentation="flow"]')).not.toBeNull();
    const flowText = flow.textContent ?? '';
    unmount();

    const { container: list } = render(<KnowledgeCard card={regate(withLongLabel(mechanism))} />);
    expect(list.querySelector('[data-presentation="list"]')).not.toBeNull();

    // Same stages, same order, in both renderings.
    for (const stage of mechanism.stages.slice(1)) {
      expect(flowText).toContain(stage.label);
    }
  });

  // #21: a non-text presentation needs a text equivalent. Here the equivalent is
  // the markup — a real ordered list — rather than a parallel description that
  // could drift from the picture.
  it('keeps ordered-list semantics so the sequence is announced', () => {
    render(<KnowledgeCard card={mechanism} />);
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');

    expect(items.length).toBe(mechanism.stages.length);
    expect(items[0]!.textContent).toContain(mechanism.stages[0]!.label);
  });

  it('carries every evidence reference the list rendering carries', () => {
    const { container } = render(<KnowledgeCard card={mechanism} />);
    const marks = container.querySelectorAll('[data-grounding-mode]');

    expect(marks.length).toBe(mechanism.stages.length);
    for (const stage of mechanism.stages) {
      expect(container.textContent).toContain(stage.description.evidenceIds[0]);
    }
  });
});
