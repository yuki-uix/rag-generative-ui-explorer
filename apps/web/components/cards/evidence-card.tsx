import type { EvidenceCard as Card, Evidence } from '@rgux/contracts';
import { CardFrame } from './card-frame.js';

/**
 * Grounding rule 3: excerpts are rendered from the corpus, never from model
 * output. The card carries identifiers only, so this component takes a resolver
 * and renders what the resolver returns.
 *
 * When an identifier does not resolve, the component says so rather than
 * hiding the row. A silently dropped citation looks identical to a card that
 * never cited anything, which is the state this card exists to make visible.
 */
export function EvidenceCard({
  card,
  resolve,
}: {
  card: Card;
  resolve?: (evidenceId: string) => Evidence | undefined;
}) {
  return (
    <CardFrame type="evidence" title={card.title}>
      <ul className="space-y-2.5">
        {card.evidenceIds.map((id) => {
          const evidence = resolve?.(id);
          return (
            <li key={id} className="space-y-0.5">
              <span className="block break-all font-mono text-[0.68rem] text-amber-700 dark:text-amber-500">
                {id}
              </span>
              {evidence ? (
                <>
                  <span className="block text-[0.72rem] text-neutral-500 dark:text-neutral-400">
                    {evidence.documentTitle}
                    {evidence.section ? ` · ${evidence.section}` : ''}
                  </span>
                  <q className="block text-[0.85rem] text-neutral-600 dark:text-neutral-400">
                    {evidence.text}
                  </q>
                </>
              ) : (
                <span className="block text-[0.78rem] text-neutral-500 dark:text-neutral-400">
                  Passage not loaded. The identifier is shown so it can be checked against
                  the corpus; no text is displayed that did not come from it.
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </CardFrame>
  );
}
