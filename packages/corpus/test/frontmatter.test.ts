import { describe, expect, it } from 'vitest';
import {
  NoteFrontmatter,
  NoteSource,
  SOURCE_TYPES,
  SOURCE_FIELDS,
  NOTE_FIELDS,
  primarySource,
  PartialDate,
} from '../src/frontmatter.js';
import { parseNote } from '../src/note.js';

const source = {
  sourceType: 'paper' as const,
  title: 'Dense Passage Retrieval for Open-Domain Question Answering',
  url: 'https://arxiv.org/abs/2004.04906',
  author: 'Vladimir Karpukhin et al.',
  published: '2020-04-10',
  retrieved: '2026-08-28',
  license: 'arXiv non-exclusive licence; short quotations only',
  primary: true,
};

const note = {
  title: 'Dense retrieval',
  domain: 'rag' as const,
  tags: ['retrieval-strategies'],
  summary: 'How a dual-encoder retriever matches meaning rather than words.',
  author: 'yuki-uix',
  revised: '2026-08-28',
  sources: [source],
};

const REQUIRED_NOTE_FIELDS = ['title', 'domain', 'tags', 'summary', 'author', 'revised'] as const;
const REQUIRED_SOURCE_FIELDS = [
  'sourceType',
  'title',
  'url',
  'author',
  'published',
  'retrieved',
  'license',
] as const;

const asFile = (frontmatter: Record<string, unknown>, body: string): string =>
  [
    '---',
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    '---',
    '',
    body,
  ].join('\n');

const without = (value: object, field: string): Record<string, unknown> => {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[field];
  return copy;
};

describe('note identity is separate from source attribution', () => {
  it('accepts a complete note', () => {
    const result = NoteFrontmatter.safeParse(note);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  /**
   * The failure this separation exists to prevent: frontmatter carrying the
   * cited paper's title, so every chunk of the note's own prose is displayed
   * under that paper's name and link.
   */
  it('keeps the note title and the source title distinct', () => {
    const parsed = NoteFrontmatter.parse(note);
    expect(parsed.title).toBe('Dense retrieval');
    expect(primarySource(parsed)?.title).toBe(
      'Dense Passage Retrieval for Open-Domain Question Answering',
    );
  });

  it('accepts a note with no external sources', () => {
    const parsed = NoteFrontmatter.parse(without(note, 'sources'));
    expect(parsed.sources).toEqual([]);
    expect(primarySource(parsed)).toBeUndefined();
  });
});

describe('required metadata', () => {
  /** Driven off the field lists so a new schema field shows up as untested. */
  it.each(REQUIRED_NOTE_FIELDS)('rejects a note missing %s', (field) => {
    expect(NoteFrontmatter.safeParse(without(note, field)).success).toBe(false);
  });

  it.each(REQUIRED_SOURCE_FIELDS)('rejects a source missing %s', (field) => {
    expect(
      NoteFrontmatter.safeParse({ ...note, sources: [without(source, field)] }).success,
    ).toBe(false);
  });

  it('covers every field named by the source policy', () => {
    for (const field of ['title', 'url', 'author', 'published', 'retrieved', 'license']) {
      expect(REQUIRED_SOURCE_FIELDS).toContain(field);
    }
    expect([...SOURCE_FIELDS].sort()).toEqual([...REQUIRED_SOURCE_FIELDS, 'primary'].sort());
    expect([...NOTE_FIELDS].sort()).toEqual([...REQUIRED_NOTE_FIELDS, 'sources'].sort());
  });

  it('rejects an empty tag list and an invented tag', () => {
    expect(NoteFrontmatter.safeParse({ ...note, tags: [] }).success).toBe(false);
    expect(NoteFrontmatter.safeParse({ ...note, tags: ['vector-databases'] }).success).toBe(false);
  });

  it('rejects an unknown domain and an unknown source type', () => {
    expect(NoteFrontmatter.safeParse({ ...note, domain: 'security' }).success).toBe(false);
    expect(
      NoteFrontmatter.safeParse({ ...note, sources: [{ ...source, sourceType: 'blog' }] }).success,
    ).toBe(false);
  });

  it('rejects unknown keys rather than ignoring them', () => {
    expect(NoteFrontmatter.safeParse({ ...note, autor: 'typo' }).success).toBe(false);
    expect(
      NoteFrontmatter.safeParse({ ...note, sources: [{ ...source, doi: '10.1/2' }] }).success,
    ).toBe(false);
  });
});

describe('source list rules', () => {
  const secondary = without({ ...source, url: 'https://arxiv.org/abs/2004.12832' }, 'primary');

  it('requires exactly one primary source', () => {
    expect(NoteFrontmatter.safeParse({ ...note, sources: [secondary] }).success).toBe(false);
    expect(
      NoteFrontmatter.safeParse({ ...note, sources: [source, { ...secondary, primary: true }] })
        .success,
    ).toBe(false);
    expect(NoteFrontmatter.safeParse({ ...note, sources: [source, secondary] }).success).toBe(true);
  });

  it('rejects the same source cited twice', () => {
    expect(
      NoteFrontmatter.safeParse({ ...note, sources: [source, without(source, 'primary')] }).success,
    ).toBe(false);
  });
});

describe('dates', () => {
  const withSource = (patch: Record<string, unknown>) =>
    NoteFrontmatter.safeParse({ ...note, sources: [{ ...source, ...patch }] }).success;

  it('accepts year, year-month, and full publication dates', () => {
    expect(withSource({ published: '2009' })).toBe(true);
    expect(withSource({ published: '2009-07' })).toBe(true);
    expect(withSource({ published: '2009-07-19' })).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    for (const value of ['2009-7', 'July 2009', '2009-13', '2009-02-30', '2009-00']) {
      expect(PartialDate.safeParse(value).success, value).toBe(false);
    }
    expect(PartialDate.safeParse('2008-02-29').success).toBe(true);
  });

  it('accepts a bare year that YAML parsed as a number', () => {
    expect(withSource({ published: 2009 })).toBe(true);
    expect(withSource({ published: 20099 })).toBe(false);
  });

  it('rejects retrieved before published, and dates in the future', () => {
    expect(withSource({ published: '2020-04-10', retrieved: '2019-01-01' })).toBe(false);
    expect(withSource({ retrieved: '2099-01-01' })).toBe(false);
    expect(NoteFrontmatter.safeParse({ ...note, revised: '2099-01-01' }).success).toBe(false);
  });

  it('compares a year-only publication on the shared prefix', () => {
    expect(withSource({ published: '2026', retrieved: '2026-08-28' })).toBe(true);
    expect(withSource({ published: '2027', retrieved: '2026-08-28' })).toBe(false);
  });

  it('requires a full date for retrieval and revision, which are ours to know', () => {
    expect(withSource({ retrieved: '2026-08' })).toBe(false);
    expect(NoteFrontmatter.safeParse({ ...note, revised: '2026-08' }).success).toBe(false);
  });
});

describe('source types', () => {
  it('are derived from the enum rather than hand-written', () => {
    expect([...SOURCE_TYPES].sort()).toEqual(['documentation', 'paper', 'specification']);
    expect(NoteSource.shape.sourceType.options).toEqual(SOURCE_TYPES);
  });
});

describe('parseNote', () => {
  it('separates frontmatter from body', () => {
    const parsed = parseNote('x.md', asFile(note, '# Dense retrieval\n\nProse.'));
    expect(parsed.frontmatter.title).toBe('Dense retrieval');
    expect(parsed.body).toBe('# Dense retrieval\n\nProse.');
  });

  it('rejects a note with no frontmatter block', () => {
    expect(() => parseNote('x.md', '# Just a heading\n')).toThrow(/missing YAML frontmatter/);
  });

  it('rejects a note with an empty body', () => {
    expect(() => parseNote('x.md', asFile(note, ''))).toThrow(/body is empty/);
  });

  it('reports malformed YAML separately from a schema failure', () => {
    expect(() => parseNote('x.md', '---\ntitle: "unterminated\n---\n\nBody.\n')).toThrow(
      /not valid YAML/,
    );
  });

  it('names the offending field when validation fails', () => {
    const broken = { ...note, sources: [without(source, 'license')] };
    expect(() => parseNote('rag/dpr.md', asFile(broken, '# Dense retrieval\n\nProse.'))).toThrow(
      /rag\/dpr\.md.*license/s,
    );
  });
});

describe('empty source lists', () => {
  it('reads a bare `sources:` key, which YAML parses as null, as no sources', () => {
    const parsed = NoteFrontmatter.parse({ ...note, sources: null });
    expect(parsed.sources).toEqual([]);
  });
});

describe('undated documentation', () => {
  const doc = {
    sourceType: 'documentation' as const,
    title: 'AI SDK UI: Generative User Interfaces',
    url: 'https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces',
    author: 'Vercel',
    retrieved: '2026-08-28',
    license: 'Vendor documentation. Short attributed quotations only.',
    primary: true,
  };

  /**
   * Living documentation frequently states no publication date. Requiring one
   * would mean inventing it — the same fabrication partial dates exist to
   * avoid.
   */
  it('accepts documentation with no publication date', () => {
    expect(NoteFrontmatter.safeParse({ ...note, sources: [doc] }).success).toBe(true);
  });

  it('still requires a date from a paper or a specification', () => {
    for (const sourceType of ['paper', 'specification'] as const) {
      const result = NoteFrontmatter.safeParse({ ...note, sources: [{ ...doc, sourceType }] });
      expect(result.success, sourceType).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toMatch(/states a publication date/);
    }
  });

  it('still requires a retrieval date, the only currency signal an undated source has', () => {
    expect(
      NoteFrontmatter.safeParse({ ...note, sources: [without(doc, 'retrieved')] }).success,
    ).toBe(false);
  });
});
