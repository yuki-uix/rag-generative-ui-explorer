import { AskPanel } from '@/components/ask-panel';

/**
 * The Markdown baseline, wired end to end. Retrieval, generation, and citation
 * verification all run on the server; the browser receives prose and a record
 * of what was checked.
 *
 * Retrieval here is lexical. Dense retrieval measures better — 65.9% against
 * 48.9% recall — but it embeds the query at request time, which needs
 * onnxruntime, which does not exist in workerd. What is measured and what is
 * served are not the same system, and saying so is cheaper than discovering it
 * from a number that will not reproduce.
 */
export default function AskPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-6">
        <p className="font-mono text-[0.62rem] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          Markdown baseline &middot; lexical retrieval &middot; live model
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Ask the corpus
        </h1>
        <p className="mt-2 max-w-prose text-[0.95rem] text-neutral-600 dark:text-neutral-400">
          This is the arm dynamic cards have to beat. Every citation is verified against the
          passages the model was actually given, and any it invents is stripped before the text
          reaches this page — the counts under each answer say which happened.
        </p>
      </header>

      <AskPanel />
    </main>
  );
}
