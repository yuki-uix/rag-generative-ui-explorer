import type { ProcedureCard as Card } from '@rgux/contracts';
import { CardFrame } from './card-frame.js';
import { Flow } from './flow.js';
import { GroundedText } from './grounded-text.js';
import { presentationFor } from './presentation.js';

export function ProcedureCard({ card }: { card: Card }) {
  const presentation = presentationFor(card);

  return (
    <CardFrame type="procedure" title={card.title} presentation={presentation}>
      {presentation === 'flow' ? (
        <Flow nodes={card.steps.map((step) => ({ label: step.title, detail: step.instruction }))} />
      ) : (
        <ol className="space-y-2.5">
          {card.steps.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[1.4rem_1fr] gap-2">
              <span className="pt-0.5 font-mono text-[0.68rem] font-semibold text-amber-700 dark:text-amber-500">
                {index + 1}
              </span>
              <span>
                <span className="block font-semibold">{step.title}</span>
                <GroundedText value={step.instruction} className="block text-[0.9rem]" />
              </span>
            </li>
          ))}
        </ol>
      )}
    </CardFrame>
  );
}
