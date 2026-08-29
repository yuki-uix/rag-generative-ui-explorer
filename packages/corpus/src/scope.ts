import { readFileSync } from 'node:fs';
import type { KnowledgeDomain } from './domain.js';

/**
 * Parses the topic bullets out of docs/KNOWLEDGE_SCOPE.md.
 *
 * Used only by tests, to assert that the controlled vocabulary in topics.ts and
 * the scope document say the same thing. Keeping the vocabulary as data and the
 * document as prose means neither can quietly drift from the other.
 */
const SECTIONS: Record<KnowledgeDomain, { start: string; end: string }> = {
  rag: { start: '## Domain A', end: '## Domain B' },
  'generative-ui': { start: '## Domain B', end: '## Intersection topics' },
  intersection: { start: '## Intersection topics', end: '## Source policy' },
};

function bulletsIn(text: string): string[] {
  const bullets: string[] = [];
  let current: string | null = null;

  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      if (current !== null) bullets.push(current);
      current = line.slice(2).trim();
    } else if (current !== null && line.startsWith('  ') && line.trim() !== '') {
      current += ` ${line.trim()}`;
    } else if (current !== null && line.trim() === '') {
      bullets.push(current);
      current = null;
    }
  }
  if (current !== null) bullets.push(current);

  return bullets;
}

export function parseScopeTopics(scopePath: string): Record<KnowledgeDomain, string[]> {
  const source = readFileSync(scopePath, 'utf8');
  const result = {} as Record<KnowledgeDomain, string[]>;

  for (const [domain, { start, end }] of Object.entries(SECTIONS)) {
    const from = source.indexOf(start);
    const to = source.indexOf(end);
    if (from === -1 || to === -1 || to <= from) {
      throw new Error(`KNOWLEDGE_SCOPE.md is missing the section between ${start} and ${end}`);
    }
    result[domain as KnowledgeDomain] = bulletsIn(source.slice(from, to));
  }

  return result;
}
