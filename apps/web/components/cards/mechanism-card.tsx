import type { MechanismCard as Card } from '@rgux/contracts';
import { CardFrame } from './card-frame.js';
import { GroundedText } from './grounded-text.js';

/**
 * Ordered stages, rendered as an ordered list. The alternate flow rendering of
 * this same data is #51; it belongs to the renderer, not to the schema, and not
 * to the model.
 */
export function MechanismCard({ card }: { card: Card }) {
  return (
    <CardFrame type="mechanism" title={card.title}>
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
    </CardFrame>
  );
}
