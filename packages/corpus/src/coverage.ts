import { KNOWLEDGE_DOMAINS, type KnowledgeDomain } from './domain.js';
import { TOPICS, type TopicId } from './topics.js';
import type { Manifest } from './manifest.js';

/**
 * Which scope topics have at least one note. This is what makes the coverage
 * criterion in M0.5–M0.7 computable rather than a reading exercise.
 */
export interface DomainCoverage {
  domain: KnowledgeDomain;
  covered: TopicId[];
  uncovered: TopicId[];
  noteCount: number;
}

export function coverage(manifest: Manifest): DomainCoverage[] {
  const tagged = new Set(manifest.documents.flatMap((document) => document.tags));

  return KNOWLEDGE_DOMAINS.map((domain) => {
    const topics = TOPICS.filter((topic) => topic.domain === domain);
    return {
      domain,
      covered: topics.filter((topic) => tagged.has(topic.id)).map((topic) => topic.id),
      uncovered: topics.filter((topic) => !tagged.has(topic.id)).map((topic) => topic.id),
      noteCount: manifest.documents.filter((document) => document.domain === domain).length,
    };
  });
}
