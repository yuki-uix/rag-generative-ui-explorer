import type { MechanismCard as Card } from '@rgux/contracts';
import { CardFrame } from './card-frame.js';
import { Flow } from './flow.js';
import { GroundedText } from './grounded-text.js';
import { presentationFor } from './presentation.js';

/**
 * Ordered stages. Whether they are drawn as a list or as a flow is decided by
 * `presentationFor` from the card's own shape — see the note there on why that
 * decision is the renderer's and not the model's.
 */
export function MechanismCard({ card }: { card: Card }) {
  const presentation = presentationFor(card);

  return (
    <CardFrame type="mechanism" title={card.title} presentation={presentation}>
      {presentation === 'flow' ? (
        <Flow
          nodes={card.stages.map((stage) => ({ label: stage.label, detail: stage.description }))}
        />
      ) : (
        <ol className="space-y-2">
          {card.stages.map((stage, index) => (
            <li key={stage.label} className="grid grid-cols-[1.4rem_1fr] gap-2">
              <span className="pt-0.5 font-mono text-[0.68rem] font-semibold text-amber-700 dark:text-amber-500">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>
                <strong className="mr-1 font-semibold">{stage.label}</strong>
                <GroundedText value={stage.description} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </CardFrame>
  );
}
