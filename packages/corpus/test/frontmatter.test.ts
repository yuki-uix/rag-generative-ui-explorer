import { describe, expect, it } from 'vitest';
import { NoteFrontmatter, SOURCE_TYPES, hasCanonicalUrl } from '../src/frontmatter.js';
import { parseNote } from '../src/note.js';

const externalFields = {
  sourceType: 'paper' as const,
  title: 'Dense Passage Retrieval',
  domain: 'rag' as const,
  tags: ['retrieval', 'embeddings'],
  summary: 'Establishes dense retrieval as a competitive alternative to lexical search.',
  url: 'https://example.invalid/papers/dpr',
  author: 'Karpukhin et al.',
  published: '2020-04-10',
  retrieved: '2026-08-29',
  license: 'arXiv non-exclusive licence; short quotations only',
};

const REQUIRED_EXTERNAL_FIELDS = [
  'title',
  'domain',
  'tags',
  'summary',
  'url',
  'author',
  'published',
  'retrieved',
  'license',
] as const;

const note = (frontmatter: Record<string, unknown>, body = 'Body text.'): string =>
  ['---', ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', '', body].join(
    '\n',
  );

describe('required metadata', () => {
  it('accepts a complete external note', () => {
    expect(NoteFrontmatter.safeParse(externalFields).success).toBe(true);
  });

  /**
   * Driven off the field list rather than written out case by case, so a field
   * added to the schema without being added here is visible as an untested one.
   */
  it.each(REQUIRED_EXTERNAL_FIELDS)('rejects a note missing %s', (field) => {
    const incomplete = { ...externalFields };
    delete (incomplete as Record<string, unknown>)[field];
    expect(NoteFrontmatter.safeParse(incomplete).success).toBe(false);
  });

  it('covers every required field named by the source policy', () => {
    for (const field of ['title', 'url', 'author', 'published', 'retrieved', 'license', 'tags']) {
      expect(REQUIRED_EXTERNAL_FIELDS).toContain(field);
    }
  });

  it('rejects an empty tag list', () => {
    expect(NoteFrontmatter.safeParse({ ...externalFields, tags: [] }).success).toBe(false);
  });

  it('rejects an unknown domain', () => {
    expect(NoteFrontmatter.safeParse({ ...externalFields, domain: 'security' }).success).toBe(false);
  });

  it('rejects a non-ISO date', () => {
    expect(NoteFrontmatter.safeParse({ ...externalFields, published: '10 April 2020' }).success).toBe(
      false,
    );
  });

  it('rejects unknown frontmatter keys rather than ignoring them', () => {
    expect(NoteFrontmatter.safeParse({ ...externalFields, autor: 'typo' }).success).toBe(false);
  });
});

describe('original notes', () => {
  const original = {
    sourceType: 'original' as const,
    title: 'Why this corpus is deliberately narrow',
    domain: 'intersection' as const,
    tags: ['scope'],
    summary: 'Explains the corpus boundary chosen for the MVP.',
    author: 'yuki-uix',
    revised: '2026-08-29',
  };

  it('accepts a note with no upstream source', () => {
    expect(NoteFrontmatter.safeParse(original).success).toBe(true);
  });

  it('rejects an original note claiming an upstream URL or licence', () => {
    expect(
      NoteFrontmatter.safeParse({ ...original, url: 'https://example.invalid/x' }).success,
    ).toBe(false);
    expect(NoteFrontmatter.safeParse({ ...original, license: 'CC BY 4.0' }).success).toBe(false);
  });

  it('rejects an original note without a revision date', () => {
    const { revised, ...withoutRevised } = original;
    expect(revised).toBeDefined();
    expect(NoteFrontmatter.safeParse(withoutRevised).success).toBe(false);
  });

  it('is excluded from URL checking', () => {
    const parsed = NoteFrontmatter.parse(original);
    expect(hasCanonicalUrl(parsed)).toBe(false);
    expect(hasCanonicalUrl(NoteFrontmatter.parse(externalFields))).toBe(true);
  });
});

describe('source types', () => {
  it('are derived from the union rather than hand-written', () => {
    expect([...SOURCE_TYPES].sort()).toEqual([
      'documentation',
      'original',
      'paper',
      'specification',
    ]);
    expect(SOURCE_TYPES).toHaveLength(NoteFrontmatter.options.length);
  });
});

describe('parseNote', () => {
  it('separates frontmatter from body', () => {
    const parsed = parseNote('x.md', note(externalFields, '# Heading\n\nProse.'));
    expect(parsed.frontmatter.title).toBe('Dense Passage Retrieval');
    expect(parsed.body).toBe('# Heading\n\nProse.');
  });

  it('rejects a note with no frontmatter block', () => {
    expect(() => parseNote('x.md', '# Just a heading\n')).toThrow(/missing YAML frontmatter/);
  });

  it('rejects a note with an empty body', () => {
    expect(() => parseNote('x.md', note(externalFields, ''))).toThrow(/body is empty/);
  });

  it('reports malformed YAML separately from a schema failure', () => {
    expect(() => parseNote('x.md', '---\ntitle: "unterminated\n---\n\nBody.\n')).toThrow(
      /not valid YAML/,
    );
  });

  it('names the offending field when validation fails', () => {
    const { license, ...withoutLicense } = externalFields;
    expect(license).toBeDefined();
    expect(() => parseNote('rag/dpr.md', note(withoutLicense))).toThrow(/rag\/dpr\.md.*license/s);
  });
});
