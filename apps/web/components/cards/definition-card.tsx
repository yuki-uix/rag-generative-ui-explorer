import type { DefinitionCard as Card } from '@rgux/contracts';
import { CardFrame } from './card-frame.js';
import { GroundedText } from './grounded-text.js';

export function DefinitionCard({ card }: { card: Card }) {
  return (
    <CardFrame type="definition" title={card.title}>
      <p className="mb-2">
        <GroundedText value={card.definition} />
      </p>
      <ul className="list-disc space-y-1 pl-5 text-[0.9rem]">
        {card.keyPoints.map((point, index) => (
          <li key={index}>
            <GroundedText value={point} />
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}
