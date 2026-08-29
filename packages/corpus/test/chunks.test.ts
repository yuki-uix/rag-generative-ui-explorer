/**
 * The chunk set is what golden evidence labels resolve against, so its
 * determinism is load-bearing before any retrieval exists. A label pointing at
 * an identifier nothing produces is exactly the plausible-looking placeholder
 * this project rejects elsewhere.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_ID_PATTERN } from '@rgux/contracts';
import { chunkNote, CHUNKING } from '../src/chunks.js';
import { buildManifest } from '../src/manifest.js';
import { parseNote } from '../src/note.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

const note = [
  '# Note title',
  '',
  'Preamble before any section.',
  '',
  '## First section',
  '',
  'One paragraph.',
  '',
  'Another paragraph.',
  '',
  '## Second section',
  '',
  'Only paragraph.',
].join('\n');

describe('chunkNote', () => {
  const chunks = chunkNote('rag/example', note);

  it('splits on h2 headings and drops the title line', () => {
    expect(chunks.map((chunk) => chunk.section)).toEqual([
      undefined,
      'First section',
      'Second section',
    ]);
    expect(chunks.some((chunk) => chunk.text.includes('# Note title'))).toBe(false);
  });

  it('keeps a short section whole rather than splitting per paragraph', () => {
    const first = chunks.find((chunk) => chunk.section === 'First section')!;
    expect(first.text).toContain('One paragraph.');
    expect(first.text).toContain('Another paragraph.');
    expect(first.chunkIndex).toBe(0);
  });

  it('emits identifiers matching the documented pattern', () => {
    for (const chunk of chunks) expect(chunk.evidenceId).toMatch(EVIDENCE_ID_PATTERN);
  });

  it('is deterministic', () => {
    expect(chunkNote('rag/example', note)).toEqual(chunks);
  });

  it('splits a long section at paragraph boundaries, never mid-sentence', () => {
    const paragraph = `${'word '.repeat(140).trim()}.`;
    const long = ['## Long', '', paragraph, '', paragraph, '', paragraph].join('\n');
    const split = chunkNote('rag/long', long);

    expect(split.length).toBeGreaterThan(1);
    expect(split.map((chunk) => chunk.chunkIndex)).toEqual(
      split.map((_, index) => index),
    );
    for (const chunk of split) expect(chunk.text.trim().endsWith('.')).toBe(true);
  });

  it('gives an oversized single paragraph its own chunk rather than cutting it', () => {
    const huge = `${'word '.repeat(400).trim()}.`;
    const split = chunkNote('rag/huge', ['## Huge', '', huge].join('\n'));

    expect(split).toHaveLength(1);
    expect(split[0]!.text.length).toBeGreaterThan(CHUNKING.maxChunkChars);
  });

  it('changes only the edited chunk when one paragraph is rewritten', () => {
    const edited = note.replace('Another paragraph.', 'A different second paragraph.');
    const after = chunkNote('rag/example', edited);

    expect(after[0]!.evidenceId).toBe(chunks[0]!.evidenceId);
    expect(after[2]!.evidenceId).toBe(chunks[2]!.evidenceId);
    expect(after[1]!.evidenceId).not.toBe(chunks[1]!.evidenceId);
  });
});

describe('the repository chunk set', () => {
  const { manifest, errors } = buildManifest(resolve(repoRoot, 'knowledge'));
  const chunks = manifest.documents.flatMap((document) =>
    chunkNote(
      document.documentId,
      parseNote(document.path, readFileSync(resolve(repoRoot, document.path), 'utf8')).body,
    ),
  );

  it('builds without errors', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('produces at least one chunk per note', () => {
    const documentsWithChunks = new Set(chunks.map((chunk) => chunk.documentId));
    expect(documentsWithChunks.size).toBe(manifest.documentCount);
  });

  it('produces unique identifiers across the whole corpus', () => {
    const ids = chunks.map((chunk) => chunk.evidenceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records the chunking parameters in the manifest, so a re-chunk is visible', () => {
    expect(manifest.chunking).toEqual({
      boundary: CHUNKING.boundary,
      maxChunkChars: CHUNKING.maxChunkChars,
    });
  });
});
