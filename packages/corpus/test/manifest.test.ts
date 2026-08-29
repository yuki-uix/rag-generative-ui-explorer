import { afterEach, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { buildManifest, UNSOURCED_SECTIONS } from '../src/manifest.js';
import { corpus, cleanUpCorpora, DEFAULT_SOURCE } from './support/corpus.js';

afterEach(cleanUpCorpora);

const SECOND_SOURCE = {
  sourceType: 'paper',
  title: 'ColBERT: Efficient and Effective Passage Search',
  url: 'https://arxiv.org/abs/2004.12832',
  author: 'Omar Khattab, Matei Zaharia',
  published: '2020-04-27',
  retrieved: '2026-08-28',
  license: 'arXiv non-exclusive licence; short quotations only',
  supports: ['the-dual-encoder'],
};

describe('manifest contents', () => {
  it('lists every corpus note under its own title, not its sources', () => {
    const { manifest, errors } = buildManifest(
      corpus([
        { path: 'rag/dpr.md' },
        {
          path: 'generative-ui/registries.md',
          frontmatter: {
            title: 'Component registries',
            domain: 'generative-ui',
            tags: ['component-registries'],
          },
        },
      ]),
    );

    expect(errors.map((error) => error.message)).toEqual([]);
    expect(manifest.documentCount).toBe(2);
    expect(manifest.documents.map((document) => document.title)).toEqual([
      'Component registries',
      'Dense retrieval',
    ]);
    expect(manifest.documents[1]?.sources[0]?.title).toBe(
      'Dense Passage Retrieval for Open-Domain Question Answering',
    );
  });

  it('records every source a note cites, not only the primary one', () => {
    const { manifest } = buildManifest(
      corpus([{ path: 'rag/dpr.md', frontmatter: { sources: [DEFAULT_SOURCE, SECOND_SOURCE] } }]),
    );

    expect(manifest.sourceCount).toBe(2);
    expect(manifest.documents[0]?.sources.map((source) => source.primary)).toEqual([true, false]);
  });

  it('counts a note with no sources without failing', () => {
    const { manifest, errors } = buildManifest(
      corpus([
        {
          path: 'rag/analysis.md',
          frontmatter: { title: 'Repository analysis', sources: [], tags: ['rag-production'] },
        },
      ]),
    );

    expect(errors.map((error) => error.message)).toEqual([]);
    expect(manifest.documentCount).toBe(1);
    expect(manifest.sourceCount).toBe(0);
  });

  it('validates but does not list READMEs and underscore-prefixed templates', () => {
    const { manifest, errors } = buildManifest(
      corpus([
        { path: 'rag/dpr.md' },
        { path: 'rag/README.md', raw: '# Notes\n\nNo frontmatter here.\n' },
        { path: '_template.md' },
      ]),
    );

    expect(errors.map((error) => error.message)).toEqual([]);
    expect(manifest.documents.map((document) => document.documentId)).toEqual(['rag/dpr']);
  });

  it('reports a broken template even though it is not part of the corpus', () => {
    const { errors } = buildManifest(
      corpus([{ path: '_template.md', raw: '---\ntitle: "only a title"\n---\n\n# x\n\nBody.\n' }]),
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

describe('title and heading agreement', () => {
  /**
   * The check exists because these diverged once, in the direction that
   * matters: frontmatter held the cited paper's title while the heading held
   * the note's, and ingestion reads the frontmatter.
   */
  it('rejects a note whose heading does not match its frontmatter title', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'rag/dpr.md',
          raw: [
            '---',
            'title: "Dense retrieval"',
            'domain: "rag"',
            'tags:',
            '  - retrieval-strategies',
            'summary: "s"',
            'author: "yuki-uix"',
            'revised: "2026-08-28"',
            '---',
            '',
            '# Dense Passage Retrieval for Open-Domain Question Answering',
            '',
            'Body.',
          ].join('\n'),
        },
      ]),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/does not match heading/);
  });

  it('rejects a note with no top-level heading', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'rag/dpr.md',
          raw: [
            '---',
            'title: "Dense retrieval"',
            'domain: "rag"',
            'tags:',
            '  - retrieval-strategies',
            'summary: "s"',
            'author: "yuki-uix"',
            'revised: "2026-08-28"',
            '---',
            '',
            '## Only a subheading',
            '',
            'Body.',
          ].join('\n'),
        },
      ]),
    );

    expect(errors[0]!.message).toMatch(/no top-level heading/);
  });
});

describe('domain and directory agreement', () => {
  it('rejects a note whose declared domain does not match its directory', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'rag/misfiled.md',
          frontmatter: { domain: 'generative-ui', tags: ['component-registries'] },
        },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/declares domain "generative-ui" but lives in knowledge\/rag/);
  });

  it('rejects a corpus note outside any domain directory', () => {
    const { errors } = buildManifest(corpus([{ path: 'stray.md' }]));
    expect(errors[0]!.message).toMatch(/must live in one of/);
  });

  it('accepts a note in the directory matching its domain', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'intersection/cards.md',
          frontmatter: {
            title: 'Evidence-aware cards',
            domain: 'intersection',
            tags: ['evidence-aware-cards'],
          },
        },
      ]),
    );
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('still allows the root-level template, which is not a corpus note', () => {
    const { errors, manifest } = buildManifest(corpus([{ path: '_template.md' }]));
    expect(errors.map((error) => error.message)).toEqual([]);
    expect(manifest.documentCount).toBe(0);
  });
});

describe('claims about verification work', () => {
  /**
   * The corpus is this system's evidence base. A note claiming a test exists
   * when it does not is a false claim the system will later retrieve, cite, and
   * present as grounded — passing every mechanical check.
   */
  it('rejects a note asserting that a test exists', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'rag/dpr.md', body: '## The dual encoder\n\nProse.\n\n## What training is doing\n\nShowing sources is local and a test asserts it makes no model call.' }]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/claims verification work exists/);
  });

  it.each(['tests assert this holds', 'the property is asserted by the suite'])(
    'rejects %s',
    (phrase) => {
      const { errors } = buildManifest(
        corpus([{ path: 'rag/dpr.md', body: `## The dual encoder\n\nProse.\n\n## What training is doing\n\nProse. ${phrase}.` }]),
      );
      expect(errors).toHaveLength(1);
    },
  );

  /** The gerund describes a specification rather than an existing test. */
  it('allows the gerund form, which describes intent', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'rag/dpr.md', body: '## The dual encoder\n\nProse.\n\n## What training is doing\n\nThe design requires a test asserting it makes no model call.' }]),
    );
    expect(errors.map((error) => error.message)).toEqual([]);
  });
});

describe('source-to-section support', () => {
  const withSupports = (supports: string[], extra: Record<string, unknown> = {}) => ({
    ...DEFAULT_SOURCE,
    supports,
    ...extra,
  });
  const body = ['## First claim', '', 'Prose.', '', '## Second claim', '', 'More prose.'].join(
    '\n',
  );

  /**
   * Over-citation. Review found a note listing a protocol's documentation as a
   * source and drawing on it nowhere; nothing recorded the relationship, so
   * nothing could check it.
   */
  it('rejects a source claiming a section that does not exist', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'rag/n.md',
          body,
          frontmatter: { sources: [withSupports(['first-claim', 'second-claim', 'invented-section'])] },
        },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/claims to support section "invented-section"/);
  });

  /**
   * Under-citation. Review found a note whose three of six sections covered
   * papers it never cited.
   */
  it('rejects a section no source claims', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'rag/n.md', body, frontmatter: { sources: [withSupports(['first-claim'])] } }]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/section "second-claim" is claimed by no source/);
  });

  it('accepts a note whose sources between them claim every section', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'rag/n.md',
          body,
          frontmatter: { sources: [withSupports(['first-claim', 'second-claim'])] },
        },
      ]),
    );
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('exempts the closing section, which is never an explication of a source', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: 'rag/n.md',
          body: `${body}\n\n## What this means here\n\nProject analysis.`,
          frontmatter: { sources: [withSupports(['first-claim', 'second-claim'])] },
        },
      ]),
    );
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('requires at least one supported section per source', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'rag/n.md', body, frontmatter: { sources: [withSupports([])] } }]),
    );
    expect(errors).toHaveLength(1);
  });

  it('leaves a note with no sources alone', () => {
    const { errors } = buildManifest(
      corpus([{ path: 'rag/n.md', body, frontmatter: { sources: [] } }]),
    );
    expect(errors.map((error) => error.message)).toEqual([]);
  });
});

describe('the repository corpus source support', () => {
  const { manifest, errors } = buildManifest(
    resolve(import.meta.dirname, '../../../knowledge'),
  );

  it('has every section either claimed by a source or exempted with a reason', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  /** An exemption nobody needs is a standing permission rather than a judgement. */
  it('carries no exemption for a section a source claims', () => {
    const claimed = new Set(
      manifest.documents.flatMap((document) =>
        document.sources.flatMap((source) =>
          source.supports.map((section) => `${document.documentId}#${section}`),
        ),
      ),
    );
    expect(Object.keys(UNSOURCED_SECTIONS.specific).filter((key) => claimed.has(key))).toEqual([]);
  });

  it('records every exemption against a note that exists', () => {
    const documents = new Set(manifest.documents.map((document) => document.documentId));
    const orphans = Object.keys(UNSOURCED_SECTIONS.specific).filter(
      (key) => !documents.has(key.split('#')[0]!),
    );
    expect(orphans).toEqual([]);
  });
});

describe('what the support check does not apply to', () => {
  /**
   * The template's sections are authoring instructions, not knowledge, so it
   * owes no source for them. It is still checked for over-claiming, which is
   * the direction that catches a broken template.
   */
  it('does not require the template to source its sections', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: '_template.md',
          body: '## An instruction\n\nHow to write a note.',
          frontmatter: { sources: [{ ...DEFAULT_SOURCE, supports: ['an-instruction'] }] },
        },
      ]),
    );
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('still rejects a template whose source claims a section it does not have', () => {
    const { errors } = buildManifest(
      corpus([
        {
          path: '_template.md',
          body: '## An instruction\n\nHow to write a note.',
          frontmatter: { sources: [{ ...DEFAULT_SOURCE, supports: ['not-a-heading'] }] },
        },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/claims to support section "not-a-heading"/);
  });
});
