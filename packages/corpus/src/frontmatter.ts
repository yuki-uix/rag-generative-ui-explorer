import { z } from 'zod';
import { KnowledgeDomain } from './domain.js';
import { TopicId } from './topics.js';

/**
 * A note is original explanatory prose written for this repository, citing one
 * or more external sources. The two are deliberately separate in the schema.
 *
 * An earlier version conflated them: a note's `title` was the cited paper's
 * title, and its single `url` was the paper's. Ingestion carries frontmatter
 * onto every chunk, so each chunk of the repository's own analysis would have
 * been displayed under the paper's name and link — a reader following the
 * citation would find nothing resembling the text they clicked from. Every
 * mechanical check passed, because the misattribution was in the data.
 *
 * So: `title` and `author` describe the note. `sources` describe what it draws
 * on. A note with no sources is pure repository analysis, which is legitimate
 * and stated rather than implied.
 */

/**
 * A publication date as precise as the source actually states, and no more.
 *
 * Many sources give only a year (a journal volume) or a year and month. Padding
 * those to a full date fabricates precision in citation metadata, which is
 * exactly the failure this corpus exists to avoid — so `YYYY`, `YYYY-MM`, and
 * `YYYY-MM-DD` are all accepted. `retrieved` stays a full date: that one is
 * ours to know exactly.
 */
export const PartialDate = z.preprocess(
  /**
   * YAML parses a bare four-digit year as a number, so `published: 2009`
   * arrives as `2009` rather than `"2009"`. Quoting is easy to forget and the
   * resulting type error says nothing useful, so a year is coerced here.
   * `2009-07` and `2009-07-19` already parse as strings.
   */
  (value) => (typeof value === 'number' && Number.isInteger(value) ? String(value) : value),
  z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'expected YYYY, YYYY-MM, or YYYY-MM-DD')
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      if (month !== undefined && (month < 1 || month > 12)) return false;
      if (day === undefined) return true;

      // Round-trip rather than trusting Date.parse, which accepts 2009-02-30.
      const date = new Date(Date.UTC(year!, month! - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month! - 1 &&
        date.getUTCDate() === day
      );
    }, 'not a real date'),
);

export const SourceType = z.enum(['paper', 'specification', 'documentation']);
export type SourceType = z.infer<typeof SourceType>;

/**
 * One cited source. Every field the source policy in KNOWLEDGE_SCOPE requires is
 * mandatory: a source with no licence constraint recorded is a source nobody can
 * decide whether they may quote.
 */
export const NoteSource = z.strictObject({
  sourceType: SourceType,
  /** The source's own title, as it should appear in a citation. */
  title: z.string().min(1),
  url: z.url(),
  author: z.string().min(1),
  published: PartialDate,
  /** When this source was last consulted for the note. */
  retrieved: z.iso.date(),
  license: z.string().min(1),
  /**
   * The source the note is principally an explication of. Exactly one source
   * carries this whenever any source is present.
   */
  primary: z.boolean().optional(),
});

export type NoteSource = z.infer<typeof NoteSource>;

/**
 * A source cannot be retrieved before it was published, and neither date can be
 * in the future. Both are ordinary typos in hand-written frontmatter, and
 * neither is visible to a per-field check.
 */
function checkSourceDates(source: NoteSource, index: number, ctx: z.RefinementCtx): void {
  const today = new Date().toISOString().slice(0, 10);

  /**
   * Compared on the shared prefix, so a year-only `published` is not read as
   * 1 January: `2026` against a `2026-03-04` retrieval is consistent.
   */
  const shared = Math.min(source.published.length, source.retrieved.length);
  if (source.retrieved.slice(0, shared) < source.published.slice(0, shared)) {
    ctx.addIssue({
      code: 'custom',
      message: `retrieved (${source.retrieved}) is before published (${source.published})`,
      path: ['sources', index, 'retrieved'],
    });
  }
  for (const field of ['published', 'retrieved'] as const) {
    if (source[field] > today) {
      ctx.addIssue({
        code: 'custom',
        message: `${field} (${source[field]}) is in the future`,
        path: ['sources', index, field],
      });
    }
  }
}

export const NoteFrontmatter = z
  .strictObject({
    /** The note's own title. Must match its top-level heading. */
    title: z.string().min(1),
    domain: KnowledgeDomain,
    /**
     * Topics from the controlled vocabulary in topics.ts. Free-form tags would
     * make corpus coverage impossible to compute; see that file.
     */
    tags: z.array(TopicId).min(1),
    summary: z.string().min(1).max(300),
    /** Who wrote the note, not who wrote the sources. */
    author: z.string().min(1),
    /** When the note was written or last revised. */
    revised: z.iso.date(),
    /**
     * Empty for a note that is entirely this repository's own analysis.
     *
     * A bare `sources:` with nothing under it parses as null in YAML, which is
     * an authoring slip rather than an intent to write something invalid, so it
     * is read as an empty list.
     */
    sources: z.preprocess(
      (value) => (value === null || value === undefined ? [] : value),
      z.array(NoteSource),
    ),
  })
  .superRefine((note, ctx) => {
    note.sources.forEach((source, index) => checkSourceDates(source, index, ctx));

    const primaries = note.sources.filter((source) => source.primary === true).length;
    if (note.sources.length > 0 && primaries !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `expected exactly one primary source, found ${primaries}`,
        path: ['sources'],
      });
    }

    const urls = note.sources.map((source) => source.url);
    if (new Set(urls).size !== urls.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'the same source is cited twice',
        path: ['sources'],
      });
    }

    if (note.revised > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({
        code: 'custom',
        message: `revised (${note.revised}) is in the future`,
        path: ['revised'],
      });
    }
  });

export type NoteFrontmatter = z.infer<typeof NoteFrontmatter>;

/** Derived from the enum at runtime, for the same reason as `CARD_TYPES`. */
export const SOURCE_TYPES: readonly SourceType[] = SourceType.options;

/**
 * Every field a source accepts, and every field the note itself accepts. The
 * corpus-version sensitivity test iterates these rather than a hand-written
 * list, so a field added to the schema is covered without anyone remembering.
 */
export const SOURCE_FIELDS: readonly string[] = Object.keys(NoteSource.shape);
export const NOTE_FIELDS: readonly string[] = Object.keys(NoteFrontmatter.shape);

export function primarySource(note: NoteFrontmatter): NoteSource | undefined {
  return note.sources.find((source) => source.primary === true);
}
