'use client';

import type { GroundedText as GroundedTextValue } from '@rgux/contracts';
import { useSourceDrawer } from './source-drawer.js';

/**
 * Grounding rule 5: `inferred` content must be visibly distinguishable from
 * content lifted out of the corpus. The distinction is carried by more than
 * colour — colour alone is invisible to a reader who cannot perceive it and to
 * a screen reader — so each mode also carries a label and, for `inferred`, a
 * left rule and an accessible prefix.
 */
const MODE = {
  extractive: {
    label: 'From the corpus',
    className: '',
    prefix: '',
  },
  summarized: {
    label: 'Summarised',
    className: 'border-l-2 border-dotted border-neutral-400 pl-3 dark:border-neutral-600',
    prefix: 'Summarised from the corpus: ',
  },
  inferred: {
    label: 'Inferred',
    className: 'border-l-2 border-amber-600 bg-amber-50/60 pl-3 dark:border-amber-500 dark:bg-amber-950/30',
    prefix: 'Inferred, not stated in the corpus: ',
  },
} as const;

export function GroundedText({
  value,
  className = '',
}: {
  value: GroundedTextValue;
  className?: string;
}) {
  const mode = MODE[value.mode];

  return (
    <span className={`${mode.className} ${className}`.trim()}>
      {mode.prefix ? <span className="sr-only">{mode.prefix}</span> : null}
      {value.text}
      <EvidenceMarks ids={value.evidenceIds} mode={value.mode} label={mode.label} />
    </span>
  );
}

/**
 * The reference marker is the field's link to its evidence, made operable by
 * #19: it is a button that opens the source drawer for exactly the identifiers
 * this field carries. The identifiers are also rendered into the accessible
 * name, so nothing later has to reconstruct which field carried which evidence.
 */
function EvidenceMarks({
  ids,
  mode,
  label,
}: {
  ids: readonly string[];
  mode: string;
  label: string;
}) {
  const drawer = useSourceDrawer();

  return (
    <button
      type="button"
      onClick={drawer ? (event) => drawer.open(ids, event.currentTarget) : undefined}
      className="ml-1 align-super font-mono text-[0.62em] text-neutral-500 underline decoration-dotted decoration-neutral-400 underline-offset-2 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:text-neutral-400 dark:decoration-neutral-600 dark:hover:text-neutral-200"
      data-grounding-mode={mode}
      data-evidence-count={ids.length}
      title={ids.join('\n')}
      aria-haspopup="dialog"
    >
      <span className="sr-only">
        {` (${label}, ${ids.length} source${ids.length === 1 ? '' : 's'}: ${ids.join(', ')})`}
      </span>
      <span aria-hidden="true">{'▪'.repeat(Math.min(ids.length, 3))}</span>
    </button>
  );
}
