/**
 * The states `docs/ARCHITECTURE.md` requires the renderer to own. They live
 * beside the cards rather than inside each one so that all five behave
 * identically — a state handled in four components and forgotten in the fifth
 * is the failure this placement avoids.
 */

export function CardLoading({ label = 'Building cards' }: { label?: string }) {
  return (
    <output
      aria-live="polite"
      className="block rounded-md border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-2">
        <div className="h-3 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-4/5 rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
    </output>
  );
}

export function CardEmpty() {
  return (
    <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-center text-[0.9rem] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      No cards to show.
    </p>
  );
}

export function CardError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-400 bg-red-50 px-3 py-3 text-[0.9rem] text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      <p className="font-semibold">This answer could not be rendered.</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

/**
 * `incompleteReason` distinguishes two situations a reader must not confuse:
 * the corpus had nothing, versus the corpus disagreed with itself. Rendering
 * them identically would tell a reader "no answer" in a case where the honest
 * report is "more than one answer".
 */
const INCOMPLETE = {
  missing: {
    heading: 'The corpus does not answer this',
    body: 'Retrieval returned passages, but none support a complete answer. Nothing is shown rather than assembling something plausible.',
  },
  conflicting: {
    heading: 'The corpus disagrees with itself',
    body: 'More than one retrieved passage bears on this question and they do not agree. The disagreement is reported rather than resolved.',
  },
} as const;

export function CardIncomplete({ reason }: { reason: 'missing' | 'conflicting' }) {
  const copy = INCOMPLETE[reason];

  return (
    <div
      data-incomplete-reason={reason}
      className="rounded-md border border-amber-500 bg-amber-50 px-3 py-3 dark:border-amber-700 dark:bg-amber-950/30"
    >
      <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-amber-800 dark:text-amber-400">
        {`incomplete · ${reason}`}
      </p>
      <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">{copy.heading}</p>
      <p className="mt-1 text-[0.9rem] text-neutral-700 dark:text-neutral-300">{copy.body}</p>
    </div>
  );
}
