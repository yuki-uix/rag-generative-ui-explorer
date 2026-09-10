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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/**
 * Every first-party source file in the workspace.
 *
 * Three top-level directories, scanned whole. Not a list of packages and not a
 * list of the directories inside them: `listSourceFiles` already recurses and
 * already skips `node_modules` and `dist`, so nothing here needs updating when
 * a package, an app, or a new directory inside one appears.
 *
 * This went through two rounds of exactly the staleness AC1 bans for card
 * types. The first version scanned only each package's `src`, hiding a cast
 * written under a package's `test`. The second derived the packages but still
 * named `apps/web` outright, which would have hidden a cast in the worker app
 * the backend evolution path introduces. A literal satisfies the type while
 * being one entry short, which is the whole failure mode — so the enumeration
 * is gone rather than corrected again.
 */
function workspaceSources(): string[] {
  return ['packages', 'apps', 'scripts']
    .map((rel) => resolve(repoRoot, rel))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => listSourceFiles(dir))
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
   * Component selection must stay a closed switch on the discriminator. These
   * are the constructs that would reopen it, each with the bypasses it must
   * catch and the legitimate code it must not.
   *
   * The probes are the point. A scan of this kind is only worth having if it
   * catches what a contributor would actually write, and the first version of
   * this test did not: its `createElement` pattern required a lowercase first
   * character while components are conventionally capitalised, its dynamic
   * `import` pattern excluded the backtick that a template literal needs, and
   * its lookup pattern matched only the literal text `card.`. Six of seven
   * realistic bypasses walked through it. A gate that looks like coverage and
   * is not is worse than no gate, so its reach is now asserted rather than
   * assumed.
   *
   * `dangerouslySetInnerHTML` has its own test — it is the markup half of the
   * same rule, kept there so its explanation stays beside it.
   */
  const BANNED = [
    {
      label: 'createElement',
      // No legitimate use under components/: JSX compiles to the automatic
      // runtime's `jsx()`, so any `createElement` is hand-written.
      pattern: /\bcreateElement\s*\(/,
      catches: [
        'return createElement(Component, props);',
        'return React.createElement(Chosen);',
        'const C = REGISTRY[card.type]; return createElement(C, props);',
      ],
      allows: ['return <DefinitionCard card={card} />;', '// creates an element for each stage'],
    },
    {
      label: 'dynamic import',
      // Anything but a literal string specifier: a template literal or a
      // variable can name a module the model chose.
      pattern: /\bimport\s*\(\s*(?!['"])/,
      catches: [
        'const mod = await import(`./cards/${card.type}.js`);',
        'const mod = await import(specifier);',
      ],
      allows: ["const mod = await import('./flow.js');", 'import type { Evidence } from "@rgux/contracts";'],
    },
    {
      label: 'component looked up by a type string',
      pattern: /\[\s*(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.)?(?:type|kind|cardType)\s*\]/,
      catches: [
        'return REGISTRY[card.type];',
        'return REGISTRY[spec.type];',
        'return COMPONENTS[props.card.type];',
        'const { type } = card; return REGISTRY[type];',
      ],
      allows: ['return stages[index];', 'return byId[evidenceId];', 'return rows[r].values[v];'],
    },
  ] as const;

  // The scan's reach, measured. Without this the patterns are a claim.
  it.each(BANNED)('the $label pattern catches what it is for', ({ pattern, catches, allows }) => {
    expect(catches.filter((probe) => !pattern.test(probe))).toEqual([]);
    expect(allows.filter((probe) => pattern.test(probe))).toEqual([]);
  });

  it.each(BANNED)('no component uses $label', ({ label, pattern }) => {
    const offenders = listSourceFiles(componentsDir)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(repoRoot.length + 1));

    // Named remedy rather than a bare file list. A contributor who reaches for
    // a table keyed by card type — icons, labels — will trip this legitimately,
    // and the cheapest wrong response to an unexplained failure is to widen the
    // pattern, which reopens exactly what it guards.
    expect(
      offenders,
      `${label} is banned in card components: selecting anything by a card's own type must stay a closed switch on the discriminator, as in knowledge-card.tsx, so an unhandled type is a build error rather than a runtime lookup. Replace the table with a switch.`,
    ).toEqual([]);
  });
});
