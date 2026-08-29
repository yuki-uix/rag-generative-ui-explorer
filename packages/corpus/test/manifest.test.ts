import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildManifest } from '../src/manifest.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface NoteSpec {
  path: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  raw?: string;
}

const defaultFrontmatter = {
  sourceType: 'paper',
  title: 'Dense Passage Retrieval',
  domain: 'rag',
  tags: ['retrieval-strategies'],
  summary: 'Dense retrieval as an alternative to lexical search.',
  url: 'https://example.invalid/papers/dpr',
  author: 'Karpukhin et al.',
  published: '2020-04-10',
  retrieved: '2026-08-29',
  license: 'Short quotations only',
};

function corpus(notes: NoteSpec[]): string {
  const root = mkdtempSync(join(tmpdir(), 'rgux-corpus-'));
  created.push(root);
  for (const note of notes) {
    const full = join(root, note.path);
    mkdirSync(join(full, '..'), { recursive: true });
    const content =
      note.raw ??
      [
        '---',
        ...Object.entries({ ...defaultFrontmatter, ...note.frontmatter }).map(
          ([key, value]) => `${key}: ${JSON.stringify(value)}`,
        ),
        '---',
        '',
        note.body ?? 'Body prose.',
      ].join('\n');
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

describe('manifest contents', () => {
  it('lists every corpus note with its metadata', () => {
    const { manifest, errors } = buildManifest(
      corpus([
        { path: 'rag/dpr.md' },
        { path: 'generative-ui/registries.md', frontmatter: { domain: 'generative-ui', tags: ['component-registries'] } },
      ]),
    );

    expect(errors).toEqual([]);
    expect(manifest.documentCount).toBe(2);
    expect(manifest.documents.map((document) => document.documentId)).toEqual([
      'generative-ui/registries',
      'rag/dpr',
    ]);
    expect(manifest.documents[1]).toMatchObject({
      path: 'knowledge/rag/dpr.md',
      title: 'Dense Passage Retrieval',
      url: 'https://example.invalid/papers/dpr',
    });
  });

  it('validates but does not list READMEs and underscore-prefixed templates', () => {
    const { manifest, errors } = buildManifest(
      corpus([
        { path: 'rag/dpr.md' },
        { path: 'rag/README.md', raw: '# Notes\n\nNo frontmatter here.\n' },
        { path: '_template.md' },
      ]),
    );

    expect(errors).toEqual([]);
    expect(manifest.documents.map((document) => document.documentId)).toEqual(['rag/dpr']);
  });

  it('reports a broken template even though it is not part of the corpus', () => {
    const { errors } = buildManifest(
      corpus([{ path: '_template.md', raw: '---\ntitle: "only a title"\n---\n\nBody.\n' }]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/_template\.md/);
  });

  it('collects every invalid note rather than stopping at the first', () => {
    const { errors } = buildManifest(
      corpus([
        { path: 'rag/a.md', raw: '# No frontmatter\n' },
        { path: 'rag/b.md', raw: '# Also none\n' },
        { path: 'rag/c.md' },
      ]),
    );
    expect(errors.map((error) => error.path).sort()).toEqual(['rag/a.md', 'rag/b.md']);
  });
});

describe('domain and directory agreement', () => {
  it('rejects a note whose declared domain does not match its directory', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'rag/misfiled.md', frontmatter: { domain: 'generative-ui', tags: ['component-registries'] } }]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/declares domain "generative-ui" but lives in knowledge\/rag/);
  });

  it('rejects a corpus note outside any domain directory', () => {
    const { errors } = buildManifest(corpus([{ path: 'stray.md' }]));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/must live in one of/);
  });

  it('accepts a note in the directory matching its domain', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'intersection/cards.md', frontmatter: { domain: 'intersection', tags: ['evidence-aware-cards'] } }]),
    );
    expect(errors).toEqual([]);
  });

  it('still allows the root-level template, which is not a corpus note', () => {
    const { errors, manifest } = buildManifest(corpus([{ path: '_template.md' }]));
    expect(errors).toEqual([]);
    expect(manifest.documentCount).toBe(0);
  });
});
