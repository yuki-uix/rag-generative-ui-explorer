import type { ReactNode } from 'react';

/**
 * Shared chrome for every card. The renderer owns layout and tokens; nothing
 * here is supplied by the model beyond the title string.
 */
export function CardFrame({
  type,
  title,
  children,
  footer,
  presentation,
}: {
  type: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Which rendering was chosen, surfaced so it is visible to tests and review. */
  presentation?: string;
}) {
  return (
    <article
      data-card-type={type}
      data-presentation={presentation}
      className="overflow-hidden rounded-md border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/60">
        <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-amber-700 dark:text-amber-500">
          {type}
        </span>
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      </header>
      <div className="px-3 py-3 text-[0.95rem] leading-relaxed text-neutral-800 dark:text-neutral-200">
        {children}
      </div>
      {footer ? (
        <footer className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/60">
          {footer}
        </footer>
      ) : null}
    </article>
  );
}
