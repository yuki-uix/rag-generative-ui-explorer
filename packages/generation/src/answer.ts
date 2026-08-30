import type { Evidence } from '@rgux/contracts';
import { handleFor, INSUFFICIENT_MARKER } from './prompt.js';

/** A citation the model wrote, resolved against the evidence it was given. */
export interface ResolvedCitation {
  readonly handle: string;
  readonly evidenceId: string;
}

export type GroundedAnswer =
  | {
      readonly incomplete: true;
      readonly reason: string;
    }
  | {
      readonly incomplete: false;
      /** Markdown with unknown citations removed. */
      readonly markdown: string;
      readonly citations: readonly ResolvedCitation[];
      /** Handles the model invented. Recorded, never rendered. */
      readonly rejected: readonly string[];
      /** Sentences that state something and cite nothing. */
      readonly uncitedSentences: readonly string[];
    };

const CITATION = /\[(E\d+)\]/g;
/**
 * The same pattern without `g`. A global regex carries `lastIndex` between
 * calls, so `CITATION.test(x)` alternates true and false on identical input —
 * which would have marked every other sentence as uncited.
 */
const HAS_CITATION = /\[E\d+\]/;

/**
 * Validate a raw completion against the evidence set the request carried.
 *
 * Server-side, and against *this* generation's evidence — not against the
 * corpus. A handle that resolves to a real chunk which was never retrieved for
 * this question is still a fabricated citation: the model could not have read
 * it, so a claim resting on it is unsupported. Checking against the corpus
 * instead would let exactly that through.
 */
export function validateAnswer(raw: string, evidence: readonly Evidence[]): GroundedAnswer {
  const trimmed = raw.trim();

  if (trimmed.startsWith(INSUFFICIENT_MARKER)) {
    const reason = trimmed.slice(INSUFFICIENT_MARKER.length).trim();
    return {
      incomplete: true,
      reason: reason.length > 0 ? reason : 'The model reported insufficient evidence without a reason.',
    };
  }

  const byHandle = new Map(evidence.map((item, index) => [handleFor(index), item.id]));

  const citations: ResolvedCitation[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  // Strip unknown handles rather than rendering them: an invented citation that
  // reaches the page is worse than a missing one, because it looks checkable.
  const markdown = trimmed.replace(CITATION, (match, handle: string) => {
    const evidenceId = byHandle.get(handle);
    if (evidenceId === undefined) {
      if (!rejected.includes(handle)) rejected.push(handle);
      return '';
    }
    if (!seen.has(handle)) {
      seen.add(handle);
      citations.push({ handle, evidenceId });
    }
    return match;
  });

  return {
    incomplete: false,
    markdown: markdown.replace(/[ \t]+\n/g, '\n').trim(),
    citations,
    rejected,
    uncitedSentences: uncitedSentences(markdown),
  };
}

/**
 * Sentences that assert something and carry no citation.
 *
 * Reported rather than removed. The acceptance criterion is that every factual
 * sentence carries an evidence ID, and the honest way to hold a generation to
 * that is to measure how often it fails — deleting the offending sentence would
 * make the answer read as though the model had complied.
 */
function uncitedSentences(markdown: string): string[] {
  const sentences: string[] = [];

  for (const piece of markdown.split(/(?<=[.!?])\s+/)) {
    const sentence = piece.trim();
    if (sentence.length === 0) continue;

    // The prompt asks for the citation before the full stop, but a model that
    // writes it after produces a fragment beginning with the citation for the
    // sentence before. Re-attaching it is the difference between measuring
    // whether a claim was supported and measuring whether the model punctuated
    // the way the prompt asked.
    const trailing = sentence.match(/^((?:\[E\d+\])+)\s*/);
    if (trailing && sentences.length > 0) {
      sentences[sentences.length - 1] += ` ${trailing[1]}`;
      const rest = sentence.slice(trailing[0].length).trim();
      if (rest.length > 0) sentences.push(rest);
      continue;
    }

    sentences.push(sentence);
  }

  return sentences
    .filter((sentence) => !HAS_CITATION.test(sentence) && /[a-z]{4}/i.test(sentence))
    .filter((sentence) => !sentence.startsWith('#'));
}
