import type { GroundedText as GroundedTextValue } from '@rgux/contracts';
import { GroundedText } from './grounded-text.js';

export type FlowNode = {
  label: string;
  detail: GroundedTextValue;
};

/**
 * A flow is an ordered list wearing a different shape.
 *
 * It is deliberately not a drawing. An `<ol>` styled as a chain keeps the
 * semantics assistive technology already understands — a list of four items,
 * announced in order — so the text equivalent #21 requires is the markup
 * itself, rather than a second description that can drift from the picture.
 *
 * Two things this avoids on purpose:
 *
 * - `display: contents` on the `<li>`, which would make the arrangement easier
 *   and has historically dropped list semantics in browsers, removing exactly
 *   the property this component claims.
 * - A connector glyph in `content`. Pseudo-element text is announced by some
 *   screen readers, so the connector is drawn as a rule with no text, and the
 *   sequence is carried by the ordinals, which are real content.
 */
export function Flow({ nodes }: { nodes: readonly FlowNode[] }) {
  return (
    <ol className="flex flex-col sm:flex-row sm:items-stretch sm:overflow-x-auto">
      {nodes.map((node, index) => (
        <li
          key={node.label}
          className={[
            'relative flex min-w-0 flex-1 flex-col gap-1 rounded border border-neutral-300 bg-neutral-50 px-2.5 py-2 dark:border-neutral-700 dark:bg-neutral-800/60',
            // The connector: a rule in the gap before every node but the first.
            // Vertical while the chain is stacked, horizontal once it is a row.
            index > 0
              ? "mt-4 before:absolute before:left-1/2 before:top-[-1rem] before:h-4 before:w-px before:bg-neutral-400 before:content-[''] sm:ml-6 sm:mt-0 sm:before:left-[-1.5rem] sm:before:top-1/2 sm:before:h-px sm:before:w-6 dark:before:bg-neutral-600"
              : '',
          ]
            .join(' ')
            .trim()}
        >
          <span className="font-mono text-[0.6rem] font-semibold tracking-[0.1em] text-amber-700 dark:text-amber-500">
            {String(index + 1).padStart(2, '0')}
          </span>
          <strong className="text-[0.85rem] font-semibold">{node.label}</strong>
          <GroundedText
            value={node.detail}
            className="text-[0.78rem] text-neutral-600 dark:text-neutral-400"
          />
        </li>
      ))}
    </ol>
  );
}
