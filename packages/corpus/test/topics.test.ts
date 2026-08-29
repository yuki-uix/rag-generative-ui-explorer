/**
 * The controlled vocabulary and docs/KNOWLEDGE_SCOPE.md must say the same
 * thing. Asserted in both directions: a topic added to the scope document
 * without an id fails here, and an id with no scope entry fails too.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOPICS, TOPIC_IDS, TopicId, topicsForDomain } from '../src/topics.js';
import { parseScopeTopics } from '../src/scope.js';
import { KNOWLEDGE_DOMAINS } from '../src/domain.js';

const scopePath = resolve(import.meta.dirname, '../../../docs/KNOWLEDGE_SCOPE.md');
const scope = parseScopeTopics(scopePath);

describe('topic vocabulary', () => {
  it.each(KNOWLEDGE_DOMAINS)('matches the %s section of KNOWLEDGE_SCOPE', (domain) => {
    expect(topicsForDomain(domain).map((topic) => topic.label).sort()).toEqual(
      [...scope[domain]].sort(),
    );
  });

  it('has a unique id for every topic', () => {
    expect(new Set(TOPIC_IDS).size).toBe(TOPICS.length);
  });

  it('uses slug-shaped ids', () => {
    for (const id of TOPIC_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('accepts a known topic and rejects an invented one', () => {
    expect(TopicId.safeParse('reranking-fusion').success).toBe(true);
    expect(TopicId.safeParse('vector-databases').success).toBe(false);
  });

  it('covers every domain', () => {
    for (const domain of KNOWLEDGE_DOMAINS) {
      expect(topicsForDomain(domain).length).toBeGreaterThan(0);
    }
  });
});

describe('scope parsing', () => {
  it('reads the bullet counts the document actually contains', () => {
    expect(scope.rag).toHaveLength(12);
    expect(scope['generative-ui']).toHaveLength(12);
    expect(scope.intersection).toHaveLength(7);
  });

  it('joins bullets that wrap across lines', () => {
    expect(scope.rag.some((topic) => topic.includes('end-to-end task success'))).toBe(true);
  });

  it('fails loudly if a section is missing rather than reporting zero topics', () => {
    const empty = resolve(import.meta.dirname, '../../../README.md');
    expect(() => parseScopeTopics(empty)).toThrow(/missing the section/);
  });
});
