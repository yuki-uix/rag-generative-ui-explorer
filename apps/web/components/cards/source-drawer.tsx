'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Evidence } from '@rgux/contracts';

type Resolve = (evidenceId: string) => Evidence | undefined;

/**
 * The source drawer is the one place field-level citations are made reachable.
 * A grounded field's marker button opens it with the field's evidence
 * identifiers; the drawer resolves each identifier through the same `resolve`
 * seam the evidence card uses, so there is exactly one way to look evidence up
 * in the renderer. Two ways would be a second place for the two to drift.
 */

interface SourceDrawerApi {
  /** Open the drawer for a set of evidence identifiers, returning focus to `trigger` on close. */
  open: (ids: readonly string[], trigger: HTMLElement | null) => void;
}

const SourceDrawerContext = createContext<SourceDrawerApi | null>(null);

/**
 * Returns the drawer's open handle, or null when no provider is mounted. Cards
 * render without a provider in tests, so callers must tolerate null rather than
 * assuming the drawer is always there.
 */
export function useSourceDrawer(): SourceDrawerApi | null {
  return useContext(SourceDrawerContext);
}

export function SourceDrawerProvider({
  resolve,
  children,
}: {
  resolve: Resolve;
  children: ReactNode;
}) {
  const [ids, setIds] = useState<readonly string[] | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const open = useCallback((nextIds: readonly string[], nextTrigger: HTMLElement | null) => {
    setTrigger(nextTrigger);
    setIds(nextIds);
  }, []);

  const close = useCallback(() => setIds(null), []);

  return (
    <SourceDrawerContext.Provider value={{ open }}>
      {children}
      {ids !== null ? (
        <SourceDrawer ids={ids} resolve={resolve} onClose={close} trigger={trigger} />
      ) : null}
    </SourceDrawerContext.Provider>
  );
}

/**
 * Presentational half of the drawer. Focus is managed here, not by the caller:
 * opening moves focus to the close button, closing returns it to the marker
 * button that opened the drawer, and Tab is trapped inside while it is open so
 * the keyboard cannot wander into the page behind the overlay. Escape closes.
 */
function SourceDrawer({
  ids,
  resolve,
  onClose,
  trigger,
}: {
  ids: readonly string[];
  resolve: Resolve;
  onClose: () => void;
  trigger: HTMLElement | null;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the drawer when it opens. The close button is the first
  // focusable element, so it is a stable landing point regardless of how many
  // sources are shown.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Return focus to the marker that opened the drawer once it closes.
  useEffect(() => {
    return () => {
      trigger?.focus();
    };
  }, [trigger]);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusable(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4">
      <dialog
        open
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="static m-0 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-md border border-neutral-300 bg-white p-0 text-neutral-900 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/60">
          <h2 id={titleId} className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Sources
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close sources"
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Close
          </button>
        </header>

        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {ids.map((id) => (
            <SourceItem key={id} id={id} evidence={resolve(id)} />
          ))}
        </ul>
      </dialog>
    </div>
  );
}

/**
 * One source in the drawer. The excerpt is rendered from `Evidence.text`, never
 * from a card field: the card carries identifiers only, and the text the reader
 * sees is the corpus chunk the identifier resolves to (grounding rule 3).
 *
 * The excerpt is a string child, so React renders it as a text node — it never
 * reaches the HTML parser, which is what keeps a `<script>` in the corpus inert.
 * The one opt-out, `dangerouslySetInnerHTML`, is banned by
 * `test/no-dangerously-set-inner-html.test.ts`. No sanitizer is needed because
 * there is no path from a string to parsed markup except the banned one.
 */
function SourceItem({ id, evidence }: { id: string; evidence: Evidence | undefined }) {
  return (
    <li className="space-y-0.5 border-b border-neutral-100 py-3 last:border-b-0 dark:border-neutral-800">
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
          {evidence.url ? (
            <a
              href={evidence.url}
              className="block text-[0.8rem] text-amber-700 underline dark:text-amber-500"
            >
              Open source
            </a>
          ) : null}
        </>
      ) : (
        <span className="block text-[0.78rem] text-neutral-500 dark:text-neutral-400">
          Passage not loaded. The identifier is shown so it can be checked against
          the corpus; no text is displayed that did not come from it.
        </span>
      )}
    </li>
  );
}

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}
