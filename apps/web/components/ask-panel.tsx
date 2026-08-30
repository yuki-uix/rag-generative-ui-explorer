'use client';

import { useRef, useState } from 'react';

/**
 * The Markdown baseline, end to end: a real question, real retrieval, a real
 * model, streamed to the page.
 *
 * This is the arm dynamic cards have to beat. It exists to be measured against,
 * so it shows what the reader would actually get — the prose as it arrives, the
 * citations resolved server-side, and the passages behind them — rather than a
 * flattering summary of it.
 */
type Passage = {
  handle: string;
  id: string;
  documentTitle: string;
  section?: string;
  text: string;
};

type Done = {
  answer:
    | { incomplete: true; reason: string }
    | { incomplete: false; markdown: string; citations: { handle: string; evidenceId: string }[]; rejected: string[]; uncitedSentences: string[] };
  stopReason: string | null;
  firstTokenMs: number | null;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
  hadHiddenReasoning: boolean;
};

const SUGGESTIONS = [
  'How does sparse retrieval differ from dense retrieval?',
  'Why can reranking not raise recall?',
  'Which vector database should I use in production?',
];

export function AskPanel() {
  const [question, setQuestion] = useState(SUGGESTIONS[0]!);
  const [asked, setAsked] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [passages, setPassages] = useState<Passage[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [openSources, setOpenSources] = useState(false);
  const busy = useRef(false);

  const ask = async (value: string) => {
    if (busy.current || value.trim().length === 0) return;
    busy.current = true;
    setAsked(value);
    setText('');
    setPassages([]);
    setDone(null);
    setOpenSources(false);
    setStatus('Searching the corpus');

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: value }),
      });

      if (!response.body) throw new Error(`No response body (HTTP ${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // `while` rather than `for (;;)`: the react-compiler lint rule fails with
      // an internal invariant on the latter. Checked by changing one thing at a
      // time — the `RunRecord` rename below was not what fixed it.
      let streaming = true;
      while (streaming) {
        const { done: finished, value: chunk } = await reader.read();
        if (finished) { streaming = false; break; }
        buffer += decoder.decode(chunk, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim().length === 0) continue;
          const event = JSON.parse(line) as Record<string, unknown>;

          if (event['type'] === 'start') {
            setPassages(event['evidence'] as Passage[]);
            setStatus(`Found ${(event['evidence'] as Passage[]).length} passages — waiting for the model`);
          } else if (event['type'] === 'delta') {
            setStatus(null);
            setText((current) => current + (event['text'] as string));
          } else if (event['type'] === 'done') {
            setStatus(null);
            setDone(event as unknown as Done);
          } else if (event['type'] === 'error') {
            setStatus(null);
            setText((current) => `${current}\n\n[the run failed: ${event['message'] as string}]`);
          }
        }
      }
    } catch (error) {
      setStatus(null);
      setText(`[request failed: ${(error as Error).message}]`);
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
            className="rounded-full border border-neutral-300 px-3 py-1 text-[0.8rem] text-neutral-600 hover:border-neutral-500 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void ask(question);
          }}
          aria-label="Your question"
          className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-[0.95rem] text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <button
          type="button"
          onClick={() => void ask(question)}
          className="rounded bg-neutral-900 px-4 py-2 text-[0.9rem] font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Ask
        </button>
      </div>

      {asked ? (
        <div className="space-y-3">
          <p className="text-[0.85rem] text-neutral-500 dark:text-neutral-400">{asked}</p>

          {status ? (
            <output aria-live="polite" className="block text-[0.9rem] text-neutral-600 dark:text-neutral-400">
              {status}…
            </output>
          ) : null}

          {text ? (
            <div className="whitespace-pre-wrap rounded-md border border-neutral-300 bg-white px-4 py-3 font-serif text-[1rem] leading-relaxed text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
              {text}
            </div>
          ) : null}

          {done ? <RunRecord done={done} passages={passages} open={openSources} onToggle={() => setOpenSources((v) => !v)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the prose does not show.
 *
 * The citation counts are the point: the reader can see that every bracketed
 * handle resolved to a passage the model was actually given, and that any it
 * invented was stripped before this text reached the page.
 */
function RunRecord({
  done,
  passages,
  open,
  onToggle,
}: {
  done: Done;
  passages: Passage[];
  open: boolean;
  onToggle: () => void;
}) {
  const answer = done.answer;

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-[0.82rem] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
      {answer.incomplete ? (
        <p className="text-amber-800 dark:text-amber-400">
          The corpus does not support an answer: {answer.reason}
        </p>
      ) : (
        <p>
          {answer.citations.length} citation(s) resolved
          {answer.rejected.length > 0
            ? `, ${answer.rejected.length} invented and stripped (${answer.rejected.join(', ')})`
            : ', none invented'}
          {answer.uncitedSentences.length > 0
            ? `, ${answer.uncitedSentences.length} sentence(s) carry no citation`
            : ''}
          .
        </p>
      )}

      <p className="font-mono text-[0.72rem]">
        first token {done.firstTokenMs ?? '—'}ms · total {done.latencyMs}ms · stop {done.stopReason} ·
        input {done.usage.inputTokens} · output {done.usage.outputTokens} · cache-read{' '}
        {done.usage.cacheReadInputTokens}
        {done.hadHiddenReasoning ? ' · output includes reasoning the reader never sees' : ''}
      </p>

      <button type="button" onClick={onToggle} className="underline">
        {open ? 'Hide' : 'Show'} the {passages.length} passages the model was given
      </button>

      {open ? (
        <ul className="space-y-2 pt-1">
          {passages.map((passage) => (
            <li key={passage.id} className="space-y-0.5">
              <span className="block font-mono text-[0.7rem] text-amber-700 dark:text-amber-500">
                [{passage.handle}] {passage.id}
              </span>
              <span className="block text-[0.75rem]">
                {passage.documentTitle}
                {passage.section ? ` · ${passage.section}` : ''}
              </span>
              <q className="block font-serif text-[0.82rem]">{passage.text}</q>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
