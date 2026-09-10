// @vitest-environment jsdom
/**
 * The single output gate (#26).
 *
 * Three separate claims, because they fail for different reasons and a reader
 * looking at a red build should be told which one broke:
 *
 * 1. **Coverage.** Every card type in the contract has both a validation path
 *    and a component. Derived from `CARD_TYPES`, so a sixth type breaks this
 *    without anyone remembering the file exists.
 * 2. **No way around.** `GatedCard` is the renderer's only accepted input and
 *    `gate` is its only producer, which the compiler enforces. The one hole the
 *    type system cannot close is a hand-written cast, so that is scanned for.
 * 3. **Nothing executable.** No model-derived string may become markup or
 *    select a component.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_TYPES, gate } from '@rgux/contracts';
import { KnowledgeCard } from '../components/cards/knowledge-card.js';
import { CARD_FIXTURES } from '../fixtures/cards.js';
import { FIXTURE_EVIDENCE, GATED_FIXTURES } from './gated.js';

afterEach(cleanup);

const repoRoot = resolve(import.meta.dirname, '../../..');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Every first-party source file in the workspace, tests and scripts included. */
function workspaceSources(): string[] {
  return ['apps/web', 'packages/contracts/src', 'packages/generation/src', 'packages/corpus/src']
    .flatMap((rel) => listSourceFiles(resolve(repoRoot, rel)))
    .map((path) => path.slice(repoRoot.length + 1));
}

describe('coverage is derived from the contract, not written out', () => {
  it.each(CARD_TYPES)('%s has a validation path and a component', (type) => {
    const raw = CARD_FIXTURES.find((card) => card.type === type);
    expect(raw, `no fixture for ${type}`).toBeDefined();

    // The validation path: the gate must accept this type, not merely not crash
    // on it. A type the gate silently drops would render nowhere, and a test
    // that only asserted "no failures" would pass on an empty result.
    const { cards, failures } = gate([raw!], FIXTURE_EVIDENCE);
    expect(failures, `${type} was refused by the gate`).toEqual([]);
    expect(cards).toHaveLength(1);

    // The component mapping, through the real dispatcher.
    const { container } = render(<KnowledgeCard card={cards[0]!} />);
    expect(
      container.querySelector(`[data-card-type="${type}"]`),
      `no component rendered for ${type}`,
    ).not.toBeNull();
  });

  it('the gate refuses a card type the contract does not have', () => {
    const raw = CARD_FIXTURES[0]!;
    const { cards, failures } = gate([{ ...raw, type: 'timeline' }], FIXTURE_EVIDENCE);

    expect(cards).toEqual([]);
    expect(failures.map((failure) => failure.stage)).toEqual(['schema']);
  });
});

describe('nothing renders without passing the gate', () => {
  /**
   * A hand-written type assertion is the only escape. The brand is declared and
   * never exported, so a spread or an object literal cannot satisfy it and no
   * module outside `gate.ts` can produce one — but an assertion onto the
   * branded type compiles anywhere. This fails the build when someone writes
   * one, which is the moment they would otherwise have quietly reopened the
   * hole.
   *
   * The pattern is matched as code, and this comment is deliberately written
   * without it: prose explaining the ban must not trip the ban. The same trap
   * is recorded in `no-dangerously-set-inner-html.test.ts`, which this file
   * follows.
   */
  it('no file outside the gate casts to GatedCard', () => {
    const CAST = /\bas\s+(?:unknown\s+as\s+)?(?:readonly\s+)?GatedCard\b/;
    const allowed = 'packages/contracts/src/gate.ts';

    const offenders = workspaceSources().filter(
      (path) => path !== allowed && CAST.test(readFileSync(resolve(repoRoot, path), 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('the brand is not exported, so gate is the only producer', async () => {
    const contracts = (await import('@rgux/contracts')) as Record<string, unknown>;
    const exported = Object.keys(contracts);

    expect(exported).toContain('gate');
    // A brand that reached the barrel would let any module mint a GatedCard.
    expect(exported.filter((name) => /^GATE$|[Bb]rand/.test(name))).toEqual([]);
  });

  it('gate output is what the renderer receives', () => {
    // Not a tautology: it asserts the fixtures the gallery and the component
    // tests render are the gate's output, so the tests cannot pass on a path
    // the product does not take.
    const { cards } = gate(CARD_FIXTURES, FIXTURE_EVIDENCE);
    expect(GATED_FIXTURES).toEqual(cards);
    expect(GATED_FIXTURES).toHaveLength(CARD_TYPES.length);
  });
});

describe('no executable model output reaches the browser', () => {
  const componentsDir = resolve(import.meta.dirname, '../components');

  /**
   * Component selection must be a closed switch on the discriminator. These are
   * the constructs that would reopen it: building an element from a value,
   * indexing a component table with a string, or loading a module by name.
   * `dangerouslySetInnerHTML` has its own test — it is the markup half of the
   * same rule, and is left there so its long explanation stays next to it.
   */
  const BANNED: readonly (readonly [string, RegExp])[] = [
    ['createElement from a value', /createElement\s*\(\s*[a-z_$]/],
    ['dynamic import', /\bimport\s*\(\s*[^'"`)]/],
    ['component looked up by card field', /\[\s*card\.[A-Za-z]+\s*\]/],
  ];

  it.each(BANNED)('components use no %s', (_label, pattern) => {
    const offenders = listSourceFiles(componentsDir).filter((file) =>
      pattern.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
