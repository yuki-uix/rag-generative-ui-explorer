/**
 * Each stage, with targeted invalid input. The stages are ordered, so each test
 * feeds a card that is sound up to the stage under test and wrong at it —
 * otherwise the test would be measuring an earlier stage.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '@rgux/contracts';
import { ingest } from '@rgux/corpus';
import { validateCards } from '../src/index.js';

const { evidence } = ingest(resolve(import.meta.dirname, '../../../knowledge'));
const retrieved = evidence.slice(0, 4);
const first = retrieved[0]!;

/** A grounded field quoting the passage it cites, so it passes every stage. */
const sound = (over: Record<string, unknown> = {}) => ({
  text: first.text.slice(0, 40),
  mode: 'extractive',
  evidenceIds: [first.id],
  ...over,
});

const definition = (over: Record<string, unknown> = {}) => ({
  id: 'card-1',
  type: 'definition',
  title: 'A title',
  definition: sound(),
  keyPoints: [sound()],
  ...over,
});

describe('stage 1: schema', () => {
  it('accepts a sound card', () => {
    const { cards, failures } = validateCards([definition()], retrieved);
    expect(failures).toEqual([]);
    expect(cards).toHaveLength(1);
  });

  it('names the stage and the path when a card is malformed', () => {
    const { cards, failures } = validateCards([definition({ keyPoints: [] })], retrieved);

    expect(cards).toEqual([]);
    expect(failures[0]!.stage).toBe('schema');
    expect(failures[0]!.path).toContain('keyPoints');
  });

  it('refuses a card type the contract does not have', () => {
    const { failures } = validateCards([definition({ type: 'timeline' })], retrieved);
    expect(failures[0]!.stage).toBe('schema');
  });

  // One bad card must not discard its siblings: the planner is asked for the
  // smallest useful set, and silently narrowing an answer is invisible.
  it('keeps the sound cards alongside a failing one', () => {
    const { cards, failures } = validateCards(
      [definition(), definition({ id: 'card-2', title: '' }), definition({ id: 'card-3' })],
      retrieved,
    );

    expect(cards.map((c) => c.id)).toEqual(['card-1', 'card-3']);
    expect(failures.map((f) => f.cardIndex)).toEqual([1]);
  });
});

describe('stage 2: evidence reference', () => {
  /**
   * The identifier is well-formed and names a real chunk — it is simply not in
   * this generation's retrieval set. The model could not have read it, so a
   * claim resting on it is unsupported, and checking the corpus instead of the
   * retrieval set would let exactly this through.
   */
  it('rejects a plausible identifier the retrieval set does not contain', () => {
    const absent = evidence[120]!;
    expect(retrieved.some((item) => item.id === absent.id)).toBe(false);

    const { cards, failures } = validateCards(
      [definition({ definition: sound({ evidenceIds: [absent.id] }) })],
      retrieved,
    );

    expect(cards).toEqual([]);
    expect(failures[0]!.stage).toBe('evidence-reference');
    expect(failures[0]!.message).toContain(absent.id);
    expect(failures[0]!.path).toBe('definition');
  });

  it('rejects an invented identifier that never existed', () => {
    const { failures } = validateCards(
      [definition({ definition: sound({ evidenceIds: ['rag/invented#body#0-deadbeef'] }) })],
      retrieved,
    );
    expect(failures[0]!.stage).toBe('evidence-reference');
  });

  it('checks every grounded field, not only the first', () => {
    const { failures } = validateCards(
      [definition({ keyPoints: [sound({ evidenceIds: ['rag/invented#body#0-deadbeef'] })] })],
      retrieved,
    );
    expect(failures[0]!.stage).toBe('evidence-reference');
    expect(failures[0]!.path).toBe('keyPoints.0');
  });

  it('reaches the nested fields of every card type', () => {
    const bad = ['rag/invented#body#0-deadbeef'];
    const shapes = [
      { id: 'c', type: 'comparison', title: 't', entities: ['a', 'b'],
        rows: [{ dimension: 'd', values: [sound(), sound({ evidenceIds: bad })] }] },
      { id: 'c', type: 'mechanism', title: 't',
        stages: [{ label: 'one', description: sound() }, { label: 'two', description: sound({ evidenceIds: bad }) }] },
      { id: 'c', type: 'procedure', title: 't',
        steps: [{ title: 'one', instruction: sound({ evidenceIds: bad }) }] },
    ];

    for (const shape of shapes) {
      const { failures } = validateCards([shape], retrieved);
      expect(failures[0]?.stage, shape.type).toBe('evidence-reference');
    }
  });
});

describe('stage 3: policy', () => {
  /**
   * The three rules #24 names are schema invariants already — `evidenceIds` is
   * `.min(1)` and the response is a discriminated union on `incomplete`. Those
   * are checked here as stage 1, because a card failing them never reaches
   * stage 3, and a policy stage that restated them could not fail.
   */
  it('leaves the rules Zod already enforces to stage 1', () => {
    const { failures } = validateCards(
      [definition({ definition: sound({ evidenceIds: [] }) })],
      retrieved,
    );
    expect(failures[0]!.stage).toBe('schema');
  });

  it('allows inferred content that cites evidence', () => {
    const { cards } = validateCards(
      [definition({ definition: sound({ text: 'A claim the passage supports without stating.', mode: 'inferred' }) })],
      retrieved,
    );
    expect(cards).toHaveLength(1);
  });

  /**
   * What Zod cannot express: whether `extractive` is true. The identifier
   * resolves and the words are not the passage's — the shape of a real defect
   * already caught once, a sentence attributed to the wrong note.
   */
  it('rejects text marked extractive whose words are not in the passage it cites', () => {
    const { cards, failures } = validateCards(
      [definition({ definition: sound({ text: 'A sentence that appears in no passage whatsoever.' }) })],
      retrieved,
    );

    expect(cards).toEqual([]);
    expect(failures[0]!.stage).toBe('policy');
    expect(failures[0]!.message).toContain('extractive');
  });

  it('does not hold summarized text to the verbatim rule', () => {
    const { cards } = validateCards(
      [definition({ definition: sound({ text: 'A compressed retelling of the passage.', mode: 'summarized' }) })],
      retrieved,
    );
    expect(cards).toHaveLength(1);
  });

  it('normalises Markdown emphasis, since a card renders plain text', () => {
    const emphasised = evidence.find((item) => /\*[a-z]+\*/i.test(item.text));
    expect(emphasised, 'no emphasised passage in the corpus to test with').toBeDefined();

    const stripped = emphasised!.text.replace(/[*_]/g, '').slice(0, 60);
    const quoting = { text: stripped, mode: 'extractive', evidenceIds: [emphasised!.id] };
    // Every field must cite the one retrieved passage, or stage 2 refuses the
    // card before stage 3 is reached — which is the pipeline working, and would
    // have made this a test of the wrong stage.
    const { cards } = validateCards(
      [definition({ definition: quoting, keyPoints: [quoting] })],
      [emphasised!] as Evidence[],
    );
    expect(cards).toHaveLength(1);
  });
});

describe('the pipeline as a whole', () => {
  it('reports one failure per card, at the first stage that refused it', () => {
    // Malformed *and* citing nothing real: schema is first, so schema reports.
    const { failures } = validateCards(
      [definition({ title: '', definition: sound({ evidenceIds: ['rag/x#body#0-deadbeef'] }) })],
      retrieved,
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]!.stage).toBe('schema');
  });

  /**
   * Stages short-circuit because a later stage cannot run on what an earlier one
   * rejected. Within a stage there is no such reason, and reporting one field at
   * a time would turn fixing into whack-a-mole.
   */
  it('reports every offending field within a stage, not only the first', () => {
    const bad = ['rag/invented#body#0-deadbeef'];
    const { failures } = validateCards(
      [definition({ definition: sound({ evidenceIds: bad }), keyPoints: [sound({ evidenceIds: bad })] })],
      retrieved,
    );

    expect(failures).toHaveLength(2);
    expect(failures.map((f) => f.path)).toEqual(['definition', 'keyPoints.0']);
    expect(new Set(failures.map((f) => f.stage))).toEqual(new Set(['evidence-reference']));
  });

  it('accepts an empty plan without inventing a failure', () => {
    expect(validateCards([], retrieved)).toEqual({ cards: [], failures: [] });
  });

  it('rejects everything when nothing was retrieved', () => {
    const { cards, failures } = validateCards([definition()], []);
    expect(cards).toEqual([]);
    expect(failures[0]!.stage).toBe('evidence-reference');
  });
});
