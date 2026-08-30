// @vitest-environment jsdom
/**
 * The source drawer (#19) makes field-level citations reachable. These assert
 * what a reader — sighted or keyboard-only — can actually perceive and operate,
 * not that a component returned something.
 *
 * The excerpt-safety assertion below is written the way it is on purpose: a
 * test that "the script did not execute" would pass trivially, because React
 * renders string children as text nodes that never reach the HTML parser. The
 * property that matters is that no element is created from the excerpt, which
 * is what `container.querySelector('script') === null` actually checks.
 */
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Evidence } from '@rgux/contracts';
import { ingest } from '@rgux/corpus';
import { CardGallery } from '../components/cards/card-gallery.js';
import { SourceDrawerProvider, useSourceDrawer } from '../components/cards/source-drawer.js';
import { CARD_FIXTURES } from '../fixtures/cards.js';
import { HOSTILE_EVIDENCE } from '../fixtures/hostile-evidence.js';

afterEach(cleanup);

const knowledgeRoot = resolve(import.meta.dirname, '../../../knowledge');
const { evidence: corpusEvidence } = ingest(knowledgeRoot);
const byId = new Map(corpusEvidence.map((item) => [item.id, item]));

type Resolve = (evidenceId: string) => Evidence | undefined;

/**
 * A minimal client that opens the drawer for a fixed set of identifiers, so the
 * drawer can be exercised directly with any resolver — including ones that
 * return hostile or missing evidence — rather than only through the gallery.
 */
function DrawerHarness({ resolve, ids }: { resolve: Resolve; ids: readonly string[] }) {
  return (
    <SourceDrawerProvider resolve={resolve}>
      <OpenButton ids={ids} />
    </SourceDrawerProvider>
  );
}

function OpenButton({ ids }: { ids: readonly string[] }) {
  const drawer = useSourceDrawer();
  return (
    <button type="button" onClick={(event) => drawer?.open(ids, event.currentTarget)}>
      Open drawer
    </button>
  );
}

describe('the source drawer', () => {
  it('renders document title, section, verbatim excerpt, and a link when the evidence carries a url', () => {
    const linked: Evidence = {
      id: 'rag/retrieval-metrics#recall-k#0-49dcb28d',
      documentId: 'rag/retrieval-metrics',
      documentTitle: 'Retrieval metrics',
      section: 'Recall@K',
      text: 'The fraction of relevant documents that appear in the top K results.',
      url: 'https://example.com/retrieval-metrics',
      retrievalScore: 0,
      metadata: {},
    };
    render(<DrawerHarness resolve={(id) => (id === linked.id ? linked : undefined)} ids={[linked.id]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Retrieval metrics · Recall@K')).toBeDefined();
    expect(
      within(dialog).getByText('The fraction of relevant documents that appear in the top K results.'),
    ).toBeDefined();
    expect(within(dialog).getByRole('link', { name: 'Open source' }).getAttribute('href')).toBe(
      'https://example.com/retrieval-metrics',
    );
  });

  it('renders the excerpt verbatim from Evidence.text, which is the corpus chunk, not the card field', () => {
    const definition = CARD_FIXTURES.find((card) => card.type === 'definition')!;
    if (definition.type !== 'definition') throw new Error('unreachable');
    const id = definition.definition.evidenceIds[0]!;
    const passage = byId.get(id)!;

    render(<CardGallery evidence={corpusEvidence} />);

    const marker = screen.getAllByRole('button', {
      name: (name) => name.includes(id),
    })[0]!;
    fireEvent.click(marker);

    const dialog = screen.getByRole('dialog');
    const excerpt = dialog.querySelector('q');
    expect(excerpt).not.toBeNull();
    // The drawer shows the full corpus chunk, never the card's shorter field
    // text. The two are different, so this catches a drawer that reuses the
    // card text instead of resolving the identifier.
    expect(passage.text).not.toBe(definition.definition.text);
    expect(excerpt!.textContent).toBe(passage.text);
  });

  it('says so when an identifier does not resolve, instead of rendering nothing', () => {
    render(<DrawerHarness resolve={() => undefined} ids={['rag/missing#body#0-00000000']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('rag/missing#body#0-00000000')).toBeDefined();
    expect(within(dialog).getByText(/Passage not loaded/)).toBeDefined();
  });

  it('renders a hostile excerpt as inert visible text, creating no element from it', () => {
    const { container } = render(
      <DrawerHarness resolve={() => HOSTILE_EVIDENCE} ids={[HOSTILE_EVIDENCE.id]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));

    // The tag is shown to the reader as text ...
    expect(
      screen.getByText(/<script>alert\("xss"\)<\/script>/),
    ).toBeDefined();
    // ... and no element was created from it.
    expect(container.querySelector('script')).toBeNull();
  });

  it('moves focus into the drawer on open and back to the trigger on close', () => {
    render(
      <DrawerHarness
        resolve={(id) => byId.get(id)}
        ids={['rag/sparse-retrieval#body#0-d441a718']}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Open drawer' });
    fireEvent.click(trigger);

    const closeButton = screen.getByRole('button', { name: 'Close sources' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab inside the drawer', () => {
    const linked: Evidence = {
      id: 'rag/retrieval-metrics#recall-k#0-49dcb28d',
      documentId: 'rag/retrieval-metrics',
      documentTitle: 'Retrieval metrics',
      section: 'Recall@K',
      text: 'The fraction of relevant documents that appear in the top K results.',
      url: 'https://example.com/retrieval-metrics',
      retrievalScore: 0,
      metadata: {},
    };
    render(<DrawerHarness resolve={() => linked} ids={[linked.id]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));

    const dialog = screen.getByRole('dialog');
    const closeButton = within(dialog).getByRole('button', { name: 'Close sources' });
    const link = within(dialog).getByRole('link', { name: 'Open source' });

    link.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    // Backwards too. The trap has a `shiftKey` branch, and a branch with no
    // test is a branch that can be deleted without anything going red — which
    // would leave Shift+Tab escaping the dialog while the forward case, the one
    // people demonstrate, kept working.
    closeButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(link);
  });
});

describe('the grounded-field markers', () => {
  it('are real buttons whose accessible name exposes the evidence identifiers', () => {
    render(<CardGallery evidence={corpusEvidence} />);

    const marker = screen.getAllByRole('button', {
      name: (name) => name.includes('rag/reranking#reranking-cannot-raise-recall#0-8f587090'),
    })[0]!;

    expect(marker.tagName).toBe('BUTTON');
    expect(marker.getAttribute('data-grounding-mode')).toBe('extractive');
    expect(marker.getAttribute('data-evidence-count')).toBe('1');
  });

  it('opens the drawer listing exactly the evidence the field carries', () => {
    render(<CardGallery evidence={corpusEvidence} />);

    // The procedure card's final step cites two identifiers and is the only
    // field carrying this pair.
    const marker = screen.getAllByRole('button', {
      name: (name) => name.includes('rag/retrieval-metrics#recall-k#0-49dcb28d'),
    })[0]!;
    fireEvent.click(marker);

    const dialog = screen.getByRole('dialog');
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });
});
