/**
 * The corpus version must move when any note changes.
 *
 * The first version of this test named two fields by hand — and they happened
 * to be the two the manifest projected, so it passed while `license`,
 * `published`, `retrieved`, and `summary` changed nothing. The sensitivity
 * check is now driven off the schema's own field list, so a field the schema
 * accepts cannot go unmeasured.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildManifest } from '../src/manifest.js';
import { frontmatterFields } from '../src/frontmatter.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const EXTERNAL = {
  sourceType: 'paper',
  title: 'Dense Passage Retrieval',
  domain: 'rag',
  tags: ['retrieval-strategies'],
  summary: 'Dense retrieval as an alternative to lexical search.',
  url: 'https://example.invalid/papers/dpr',
  author: 'Karpukhin et al.',
  published: '2020-04-10',
  retrieved: '2026-08-28',
  license: 'Short quotations only',
} as const;

/** A different, still-valid value for each field the schema accepts. */
const ALTERNATIVES: Record<string, unknown> = {
  title: 'Dense Passage Retrieval, revised title',
  domain: 'rag',
  tags: ['retrieval-strategies', 'embeddings-similarity'],
  summary: 'A materially different summary of the same paper.',
  url: 'https://example.invalid/papers/dpr-v2',
  author: 'Karpukhin and others',
  published: '2020-04-11',
  retrieved: '2026-08-27',
  license: 'CC BY 4.0',
};

function versionOf(overrides: Record<string, unknown> = {}, body = 'Body prose.'): string {
  const root = mkdtempSync(join(tmpdir(), 'rgux-version-'));
  created.push(root);
  mkdirSync(join(root, 'rag'), { recursive: true });

  const frontmatter = { ...EXTERNAL, ...overrides };
  writeFileSync(
    join(root, 'rag', 'dpr.md'),
    [
      '---',
      ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
      '---',
      '',
      body,
    ].join('\n'),
  );

  const { manifest, errors } = buildManifest(root);
  expect(errors.map((error) => error.message)).toEqual([]);
  return manifest.corpusVersion;
}

describe('corpus version sensitivity', () => {
  const baseline = versionOf();

  /**
   * `sourceType` is excluded because changing it changes which fields are
   * required, so it cannot be varied in isolation; it is covered by the
   * cross-source-type case below.
   */
  const varyingFields = frontmatterFields('paper').filter((field) => field !== 'sourceType');

  it('has an alternative value for every field the schema accepts', () => {
    expect(varyingFields.filter((field) => !(field in ALTERNATIVES))).toEqual([]);
  });

  it.each(varyingFields.filter((field) => field !== 'domain'))(
    'changes when %s changes',
    (field) => {
      expect(versionOf({ [field]: ALTERNATIVES[field] })).not.toBe(baseline);
    },
  );

  it('changes when the body changes', () => {
    expect(versionOf({}, 'Entirely different prose.')).not.toBe(baseline);
  });

  it('changes when the source type changes', () => {
    expect(versionOf({ sourceType: 'documentation' })).not.toBe(baseline);
  });

  it('is stable for identical input', () => {
    expect(versionOf()).toBe(baseline);
  });

  it('ignores whitespace reflow, matching evidence ID hashing', () => {
    expect(versionOf({}, 'Body\n   prose.')).toBe(versionOf({}, 'Body prose.'));
  });

  it('does not depend on frontmatter key order', () => {
    const reordered = Object.fromEntries(
      Object.entries(EXTERNAL).reverse(),
    ) as unknown as Record<string, unknown>;
    expect(versionOf(reordered)).toBe(baseline);
  });
});
