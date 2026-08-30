import type { Evidence } from '@rgux/contracts';

/**
 * Prompt version. Bumped on any edit to the text below, because
 * `eval/PROTOCOL.md` records it as a pinned variable and a comparison whose
 * arms disagree on it is not a comparison.
 */
export const PROMPT_VERSION = 'markdown-baseline-1';

/** The exact string the model emits when the evidence cannot support an answer. */
export const INSUFFICIENT_MARKER = 'INSUFFICIENT_EVIDENCE';

/**
 * Evidence is offered to the model under short handles rather than its real
 * identifiers.
 *
 * Two reasons, and the second is the one that matters. A handle is short enough
 * that citing it does not dominate the sentence it supports. And the model can
 * only cite a handle that was given to it, so an invented citation is a handle
 * outside the set rather than a plausible-looking identifier that has to be
 * checked against the corpus — the difference between a rejection and an
 * investigation.
 */
export function handleFor(index: number): string {
  return `E${index + 1}`;
}

export interface PromptInputs {
  question: string;
  evidence: readonly Evidence[];
}

/**
 * System instructions.
 *
 * **No corpus text appears here.** `docs/ARCHITECTURE.md` requires that corpus
 * text is never concatenated into system instructions: the system prompt is the
 * operator's channel, and passages retrieved from a corpus are data. Mixing the
 * two makes a note's contents indistinguishable from an instruction, which is
 * the shape of a prompt injection. `test/prompt.test.ts` asserts this rather
 * than leaving it to a reviewer's memory.
 */
export function systemPrompt(): string {
  return [
    'You answer questions using only the evidence passages supplied in the user message.',
    '',
    'Rules:',
    '1. Every sentence that states a fact carries at least one citation in square brackets, placed before the full stop: `Sparse retrieval matches literal terms [E1].` Several are written together as `[E1][E3]`. Cite only handles that appear in the evidence.',
    '2. Do not state anything the evidence does not support. Do not add background knowledge of your own, however certain you are of it.',
    `3. If the evidence cannot support an answer to the question, reply with exactly ${INSUFFICIENT_MARKER} on the first line, then one sentence saying what is missing. Do not answer partially and do not guess.`,
    '4. Write Markdown prose. Short paragraphs. No headings, no bullet lists, no preamble about what you are about to do.',
    '5. Do not mention the evidence handles in prose ("as E1 says"). They are citations, not subjects.',
  ].join('\n');
}

/**
 * The user message: the question and the evidence, in that order.
 *
 * The question comes first so that a long evidence block does not push it out
 * of the reader's — or the model's — attention. Passages are numbered by
 * position, and that numbering is the only name the model is given for them.
 */
export function userPrompt({ question, evidence }: PromptInputs): string {
  const passages = evidence.map(
    (item, index) =>
      `[${handleFor(index)}] ${item.documentTitle}${item.section ? ` — ${item.section}` : ''}\n${item.text}`,
  );

  return [
    `Question: ${question}`,
    '',
    'Evidence:',
    '',
    passages.join('\n\n'),
  ].join('\n');
}
