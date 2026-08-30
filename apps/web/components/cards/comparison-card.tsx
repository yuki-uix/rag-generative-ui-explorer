import type { ComparisonCard as Card } from '@rgux/contracts';
import { CardFrame } from './card-frame.js';
import { GroundedText } from './grounded-text.js';

/**
 * Real table semantics, not a grid of divs: #21 requires headers associated to
 * cells, and a comparison read column by column is exactly what assistive
 * technology needs the association for.
 */
export function ComparisonCard({ card }: { card: Card }) {
  return (
    <CardFrame type="comparison" title={card.title}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.85rem]">
          <caption className="sr-only">{card.title}</caption>
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Dimension
              </th>
              {card.entities.map((entity) => (
                <th
                  key={entity}
                  scope="col"
                  className="border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400"
                >
                  {entity}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row) => (
              <tr key={row.dimension}>
                <th
                  scope="row"
                  className="border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left text-[0.75rem] font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400"
                >
                  {row.dimension}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={`${row.dimension}-${card.entities[index]}`}
                    className="border border-neutral-200 px-2 py-1.5 align-top dark:border-neutral-800"
                  >
                    <GroundedText value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardFrame>
  );
}
