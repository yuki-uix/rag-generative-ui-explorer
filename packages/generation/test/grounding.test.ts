/**
 * The properties that decide whether a generated answer may be shown. All are
 * deterministic and none calls a model: what a model happens to write varies
 * per run, but what the pipeline accepts from it must not.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingest } from '@rgux/corpus';
import {
  CLAUDE_OPUS_5,
  DEEPSEEK,
  INSUFFICIENT_MARKER,
  profileByIdOrThrow,
  requestExtras,
  systemPrompt,
  userPrompt,
  validateAnswer,
} from '../src/index.js';

const { evidence } = ingest(resolve(import.meta.dirname, '../../../knowledge'));
const retrieved = evidence.slice(0, 3);

describe('the system prompt', () => {
  // The criterion deferred out of #19 because no prompt existed to check.
  it('carries no corpus text', () => {
    const system = systemPrompt();
    const leaked = evidence.filter((item) => system.includes(item.text.slice(0, 60)));

    expect(leaked.map((item) => item.id)).toEqual([]);
  });

  it('puts the evidence in the user message instead', () => {
    const user = userPrompt({ question: 'What is BM25?', evidence: retrieved });

    for (const [index, item] of retrieved.entries()) {
      expect(user).toContain(`[E${index + 1}]`);
      expect(user).toContain(item.text);
    }
  });

  it('never shows the model a real evidence identifier', () => {
    const user = userPrompt({ question: 'What is BM25?', evidence: retrieved });

    // Handles, not identifiers: an invented citation is then a handle outside
    // the set rather than something that has to be checked against the corpus.
    for (const item of retrieved) expect(user).not.toContain(item.id);
  });
});

describe('answer validation', () => {
  it('resolves handles back to the evidence identifiers they stand for', () => {
    const answer = validateAnswer('Sparse retrieval matches literal terms. [E1]', retrieved);

    expect(answer.incomplete).toBe(false);
    if (answer.incomplete) return;
    expect(answer.citations).toEqual([{ handle: 'E1', evidenceId: retrieved[0]!.id }]);
    expect(answer.rejected).toEqual([]);
  });

  it('strips a handle that was never offered, and records it', () => {
    const answer = validateAnswer('A claim with an invented source. [E9]', retrieved);

    expect(answer.incomplete).toBe(false);
    if (answer.incomplete) return;
    expect(answer.rejected).toEqual(['E9']);
    expect(answer.markdown).not.toContain('E9');
    expect(answer.citations).toEqual([]);
  });

  /**
   * The check is against this generation's evidence, not the corpus. A handle
   * standing for a real chunk that was not retrieved is still fabricated: the
   * model could not have read it, so a claim resting on it is unsupported.
   */
  it('rejects a citation the retrieval set did not contain, even though the corpus does', () => {
    const notRetrieved = evidence[100]!;
    expect(retrieved.some((item) => item.id === notRetrieved.id)).toBe(false);

    const answer = validateAnswer('A claim. [E4]', retrieved);
    expect(answer.incomplete).toBe(false);
    if (answer.incomplete) return;
    expect(answer.rejected).toEqual(['E4']);
  });

  it('reports the insufficient-evidence path as a state, not as prose', () => {
    const answer = validateAnswer(
      `${INSUFFICIENT_MARKER}\nThe passages describe BM25 but never name a default for k1.`,
      retrieved,
    );

    expect(answer.incomplete).toBe(true);
    if (!answer.incomplete) return;
    expect(answer.reason).toContain('never name a default');
  });

  it('gives the incomplete state a reason even when the model omits one', () => {
    const answer = validateAnswer(INSUFFICIENT_MARKER, retrieved);
    expect(answer.incomplete).toBe(true);
    if (!answer.incomplete) return;
    expect(answer.reason.length).toBeGreaterThan(0);
  });

  /**
   * Regression: the citation pattern is global, and a global regex carries
   * `lastIndex` between `.test()` calls. Sharing it with this check made every
   * other cited sentence report as uncited.
   */
  it('does not report cited sentences as uncited, however many there are', () => {
    const answer = validateAnswer(
      'First claim. [E1] Second claim. [E2] Third claim. [E3] Fourth claim. [E1]',
      retrieved,
    );

    expect(answer.incomplete).toBe(false);
    if (answer.incomplete) return;
    expect(answer.uncitedSentences).toEqual([]);
  });

  it('reports an uncited factual sentence rather than deleting it', () => {
    const answer = validateAnswer('A cited claim. [E1] An uncited claim about retrieval.', retrieved);

    expect(answer.incomplete).toBe(false);
    if (answer.incomplete) return;
    expect(answer.uncitedSentences).toEqual(['An uncited claim about retrieval.']);
    // Reported, not removed: deleting it would make the answer read as though
    // the model had complied, and the rate is what the criterion measures.
    expect(answer.markdown).toContain('An uncited claim about retrieval.');
  });
});

describe('model profiles', () => {
  it('sends Anthropic-only parameters only to the profile that declares them', () => {
    expect(requestExtras(DEEPSEEK)).toEqual({});
    expect(requestExtras(CLAUDE_OPUS_5)).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
  });

  it('never carries a key, only the name of the variable holding one', () => {
    for (const profile of [DEEPSEEK, CLAUDE_OPUS_5]) {
      expect(JSON.stringify(profile)).not.toMatch(/sk-|key["']?\s*:\s*["'][A-Za-z0-9]/);
      expect(profile.apiKeyEnv).toMatch(/API_KEY$/);
    }
  });

  it('refuses an unknown profile by name rather than falling back to a default', () => {
    expect(() => profileByIdOrThrow('gpt-4')).toThrow(/Unknown model profile/);
  });
});
