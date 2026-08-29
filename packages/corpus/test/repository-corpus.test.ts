/**
 * Runs against the real `knowledge/` directory rather than a fixture, so the
 * committed template and manifest are checked by the same code path CI uses.
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildManifest, serialiseManifest, Manifest } from '../src/manifest.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const knowledgeRoot = resolve(repoRoot, 'knowledge');

describe('the repository corpus', () => {
  const { manifest, errors } = buildManifest(knowledgeRoot);

  it('has no notes failing metadata validation', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('keeps the committed manifest in sync with the notes', () => {
    const committed = readFileSync(resolve(knowledgeRoot, 'manifest.json'), 'utf8');
    expect(committed).toBe(serialiseManifest(manifest));
  });

  it('produces a manifest matching its own schema', () => {
    expect(Manifest.safeParse(manifest).success).toBe(true);
  });

  it('excludes the template from the corpus', () => {
    expect(manifest.documents.map((document) => document.documentId)).not.toContain('_template');
  });
});
