import { KnowledgeCard } from '@/components/cards/knowledge-card';
import { CardEmpty, CardError, CardIncomplete, CardLoading } from '@/components/cards/states';
import { CARD_FIXTURES } from '@/fixtures/cards';

/**
 * A gallery of the five card components and the states the renderer owns (#18),
 * rendered from fixtures. There is no retrieval and no model here: the planner
 * is #23, and the conversation shell is a separate slice.
 *
 * Every passage below is quoted from `knowledge/`, and every evidence
 * identifier resolves — `test/fixtures-grounded.test.ts` fails the build
 * otherwise.
 */
export default function CardGallery() {
  return (
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
          field carry its evidence identifiers and its grounding mode.
        </p>
      </header>

      <div className="space-y-5">
        {CARD_FIXTURES.map((card) => (
          <KnowledgeCard key={card.id} card={card} />
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
  );
}
