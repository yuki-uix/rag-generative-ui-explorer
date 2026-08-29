/**
 * The corpus version must move when any note changes.
 *
 * An earlier version of this test named two fields by hand — and they happened
 * to be the two the manifest projected, so it passed while `license`,
 * `published`, `retrieved`, and `summary` changed nothing. The sensitivity
 * check is driven off the schema's own field lists, so a field the schema
 * accepts cannot go unmeasured.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildManifest } from '../src/manifest.js';
import { NOTE_FIELDS, SOURCE_FIELDS } from '../src/frontmatter.js';
import { corpus, cleanUpCorpora, DEFAULT_SOURCE } from './support/corpus.js';

afterEach(cleanUpCorpora);

/** A different, still-valid value for each field the schema accepts. */
const NOTE_ALTERNATIVES: Record<string, unknown> = {
  title: 'Dense retrieval, revisited',
  domain: 'rag',
  tags: ['retrieval-strategies', 'embeddings-similarity'],
  summary: 'A materially different summary of the same material.',
  author: 'someone-else',
  revised: '2026-08-27',
  sources: [],
};

const SOURCE_ALTERNATIVES: Record<string, unknown> = {
  sourceType: 'documentation',
  title: 'Dense Passage Retrieval, revised title',
  url: 'https://arxiv.org/abs/2004.04906v1',
  author: 'Karpukhin and others',
  published: '2020-04-11',
  retrieved: '2026-08-27',
  license: 'CC BY 4.0',
  // Differs from the default, which claims both sections.
  supports: ['the-dual-encoder'],
  primary: true,
};

function versionOf(
  noteOverrides: Record<string, unknown> = {},
  body = '## The dual encoder\n\nProse.\n\n## What training is doing\n\nBody prose.',
): string {
  const { manifest, errors } = buildManifest(
    corpus([{ path: 'rag/dpr.md', frontmatter: noteOverrides, body }]),
  );
  expect(errors.map((error) => error.message)).toEqual([]);
  return manifest.corpusVersion;
}

describe('corpus version sensitivity', () => {
  const baseline = versionOf();

  it('has an alternative value for every field the schema accepts', () => {
    expect(NOTE_FIELDS.filter((field) => !(field in NOTE_ALTERNATIVES))).toEqual([]);
    expect(SOURCE_FIELDS.filter((field) => !(field in SOURCE_ALTERNATIVES))).toEqual([]);
  });

  it.each(NOTE_FIELDS.filter((field) => field !== 'domain'))(
    'changes when the note field %s changes',
    (field) => {
      expect(versionOf({ [field]: NOTE_ALTERNATIVES[field] })).not.toBe(baseline);
    },
  );

  /**
   * `supports` is excluded from the sweep for the same reason `domain` is: it
   * is cross-checked against the body, so it cannot be varied in isolation.
   * It gets a purpose-built case below rather than a hole here.
   */
  it.each(SOURCE_FIELDS.filter((field) => field !== 'primary' && field !== 'supports'))(
    'changes when the source field %s changes',
    (field) => {
      expect(
        versionOf({ sources: [{ ...DEFAULT_SOURCE, [field]: SOURCE_ALTERNATIVES[field] }] }),
      ).not.toBe(baseline);
    },
  );

  it('changes when a source claims a different set of sections', () => {
    const body = [
      '## The dual encoder',
      '',
      'Prose.',
      '',
      '## What training is doing',
      '',
      'More prose.',
    ].join('\n');

    const both = versionOf(
      { sources: [{ ...DEFAULT_SOURCE, supports: ['the-dual-encoder', 'what-training-is-doing'] }] },
      body,
    );
    const split = versionOf(
      {
        sources: [
          { ...DEFAULT_SOURCE, supports: ['the-dual-encoder'] },
          {
            ...DEFAULT_SOURCE,
            url: 'https://arxiv.org/abs/2004.12832',
            supports: ['what-training-is-doing'],
            primary: undefined,
          },
        ].map((source) => {
          const copy: Record<string, unknown> = { ...source };
          if (copy.primary === undefined) delete copy.primary;
          return copy;
        }),
      },
      body,
    );

    expect(split).not.toBe(both);
  });

  it('changes when the body changes', () => {
    expect(versionOf({}, '## The dual encoder\n\nProse.\n\n## What training is doing\n\nEntirely different prose.')).not.toBe(baseline);
  });

  it('changes when a source is added', () => {
    expect(
      versionOf({
        sources: [
          DEFAULT_SOURCE,
          { ...DEFAULT_SOURCE, url: 'https://arxiv.org/abs/2004.12832', primary: undefined },
        ].map((source) => {
          const copy: Record<string, unknown> = { ...source };
          if (copy.primary === undefined) delete copy.primary;
          return copy;
        }),
      }),
    ).not.toBe(baseline);
  });

  it('is stable for identical input', () => {
    expect(versionOf()).toBe(baseline);
  });

  it('ignores whitespace reflow, matching evidence ID hashing', () => {
    expect(versionOf({}, '## The dual encoder\n\nProse.\n\n## What training is doing\n\nBody\n   prose.')).toBe(
      versionOf({}, '## The dual encoder\n\nProse.\n\n## What training is doing\n\nBody prose.'),
    );
  });

  it('does not depend on frontmatter key order', () => {
    const reordered = Object.fromEntries(
      Object.entries({
        revised: '2026-08-28',
        author: 'yuki-uix',
        summary: 'How a dual-encoder retriever matches meaning rather than words.',
        tags: ['retrieval-strategies'],
        domain: 'rag',
        title: 'Dense retrieval',
        sources: [DEFAULT_SOURCE],
      }),
    );
    expect(versionOf(reordered)).toBe(baseline);
  });

  it('does not depend on filesystem ordering', () => {
    const second = { title: 'BM25', tags: ['retrieval-strategies'] };
    const forwards = buildManifest(
      corpus([{ path: 'rag/a.md' }, { path: 'rag/b.md', frontmatter: second }]),
    ).manifest.corpusVersion;
    const backwards = buildManifest(
      corpus([{ path: 'rag/b.md', frontmatter: second }, { path: 'rag/a.md' }]),
    ).manifest.corpusVersion;
    expect(forwards).toBe(backwards);
  });
});
