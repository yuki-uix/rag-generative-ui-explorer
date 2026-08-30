'use client';

import { useMemo } from 'react';
import type { Evidence } from '@rgux/contracts';
import { CARD_FIXTURES } from '../../fixtures/cards.js';
import { KnowledgeCard } from './knowledge-card.js';
import { SourceDrawerProvider } from './source-drawer.js';
import { CardEmpty, CardError, CardIncomplete, CardLoading } from './states.js';

/**
 * The gallery from #18, now wired to the source drawer (#19). It is a client
 * component because the markers open the drawer and the drawer owns focus; the
 * page passes it the corpus evidence as data and the resolver is built here,
 * once, so the evidence card and the drawer share the same lookup rather than
 * two that could drift.
 */
export function CardGallery({ evidence }: { evidence: readonly Evidence[] }) {
  const resolve = useMemo(() => {
    const byId = new Map(evidence.map((item) => [item.id, item]));
    return (evidenceId: string): Evidence | undefined => byId.get(evidenceId);
  }, [evidence]);

  return (
    <SourceDrawerProvider resolve={resolve}>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8">
          <p className="font-mono text-[0.62rem] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            Renderer gallery &middot; fixtures, no model
          </p>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Knowledge cards
          </h1>
          <p className="mt-2 max-w-prose text-[0.95rem] text-neutral-600 dark:text-neutral-400">
            One component per card type, plus the loading, empty, incomplete, and error states.
            The text is quoted from the corpus and every citation resolves; the marks after a
            field carry its evidence identifiers and open the source drawer.
          </p>
        </header>

        <div className="space-y-5">
          {CARD_FIXTURES.map((card) => (
            <KnowledgeCard key={card.id} card={card} resolveEvidence={resolve} />
          ))}
        </div>

        <h2 className="mt-10 mb-3 font-mono text-[0.62rem] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          States
        </h2>
        <div className="space-y-4">
          <CardIncomplete reason="missing" />
          <CardIncomplete reason="conflicting" />
          <CardLoading />
          <CardEmpty />
          <CardError message="A card referenced an evidence identifier that is not in the retrieved set." />
        </div>
      </main>
    </SourceDrawerProvider>
  );
}
