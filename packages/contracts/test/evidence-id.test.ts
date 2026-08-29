/**
 * Evidence ID stability is the precondition for replayable evaluation: if
 * re-ingestion rotates IDs, every stored golden label and every logged
 * generation stops resolving.
 */
import { describe, expect, it } from 'vitest';
import { EVIDENCE_ID_PATTERN, makeEvidenceId, parseEvidenceId, slugify } from '../src/index.js';

interface Chunk {
  section?: string;
  text: string;
}

/** Stand-in for the ingestion pipeline: assigns chunk indices within a section. */
function idsFor(documentId: string, chunks: Chunk[]): string[] {
  const perSection = new Map<string, number>();
  return chunks.map((chunk) => {
    const key = chunk.section ?? '';
    const chunkIndex = perSection.get(key) ?? 0;
    perSection.set(key, chunkIndex + 1);
    return makeEvidenceId({ documentId, section: chunk.section, chunkIndex, text: chunk.text });
  });
}

const document: Chunk[] = [
  { section: 'Motivation', text: 'Retrieval grounds generation in a corpus the model did not memorise.' },
  { section: 'Motivation', text: 'Grounding lets the system cite rather than assert.' },
  { section: 'Chunking', text: 'Chunk boundaries should follow document structure.' },
];

describe('makeEvidenceId', () => {
  it('produces an identical ID set when the same document is ingested twice', () => {
    expect(idsFor('rag/motivation', document)).toEqual(idsFor('rag/motivation', document));
  });

  it('changes only the edited chunk when one paragraph is rewritten', () => {
    const before = idsFor('rag/motivation', document);
    const edited = document.map((chunk, index) =>
      index === 1 ? { ...chunk, text: 'Grounding lets the system cite its sources.' } : chunk,
    );
    const after = idsFor('rag/motivation', edited);

    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).not.toBe(before[1]);
  });

  it('gives different IDs to identical text in different documents', () => {
    const text = 'Chunk boundaries should follow document structure.';
    const a = makeEvidenceId({ documentId: 'rag/chunking', chunkIndex: 0, text });
    const b = makeEvidenceId({ documentId: 'generative-ui/chunking', chunkIndex: 0, text });
    expect(a).not.toBe(b);
  });

  it('is insensitive to whitespace reflow but not to wording', () => {
    const base = { documentId: 'rag/chunking', chunkIndex: 0 };
    const reflowed = makeEvidenceId({ ...base, text: 'Chunk boundaries\n  should follow  structure.' });
    const original = makeEvidenceId({ ...base, text: 'Chunk boundaries should follow structure.' });
    const reworded = makeEvidenceId({ ...base, text: 'Chunk boundaries should follow the structure.' });

    expect(reflowed).toBe(original);
    expect(reworded).not.toBe(original);
  });

  it('emits IDs matching the documented pattern', () => {
    for (const id of idsFor('rag/motivation', document)) {
      expect(id).toMatch(EVIDENCE_ID_PATTERN);
    }
  });

  it('uses a placeholder slug for text before the first heading', () => {
    const id = makeEvidenceId({ documentId: 'rag/intro', chunkIndex: 0, text: 'Preamble.' });
    expect(parseEvidenceId(id).sectionSlug).toBe('body');
  });

  it('rejects inputs that would produce an unparseable ID', () => {
    expect(() => makeEvidenceId({ documentId: 'RAG/Chunking', chunkIndex: 0, text: 'x' })).toThrow();
    expect(() => makeEvidenceId({ documentId: 'rag/a', chunkIndex: -1, text: 'x' })).toThrow();
    expect(() => makeEvidenceId({ documentId: 'rag/a', chunkIndex: 0, text: '   ' })).toThrow();
  });
});

describe('parseEvidenceId', () => {
  it('round-trips the components of a generated ID', () => {
    const id = makeEvidenceId({
      documentId: 'rag/hybrid-retrieval',
      section: 'Reciprocal Rank Fusion',
      chunkIndex: 3,
      text: 'Fusion combines ranked lists.',
    });
    expect(parseEvidenceId(id)).toMatchObject({
      documentId: 'rag/hybrid-retrieval',
      sectionSlug: 'reciprocal-rank-fusion',
      chunkIndex: 3,
    });
  });

  it('rejects a malformed ID rather than returning partial components', () => {
    expect(() => parseEvidenceId('not-an-evidence-id')).toThrow();
  });
});

describe('slugify', () => {
  it('falls back to a placeholder when a heading has no usable characters', () => {
    expect(slugify('!!!')).toBe('body');
  });
});
