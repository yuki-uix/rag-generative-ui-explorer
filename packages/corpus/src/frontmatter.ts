import { z } from 'zod';
import { KnowledgeDomain } from './domain.js';
import { TopicId } from './topics.js';

/**
 * Required note metadata, from the source policy in docs/KNOWLEDGE_SCOPE.md:
 * title, canonical URL, author or organization, date, retrieval date, licence
 * or quotation constraints where relevant, and topic tags.
 *
 * The policy allows four kinds of source, and the fourth — original notes
 * written for this repository — has no canonical URL, publication date, or
 * upstream licence to record. Rather than making those fields optional for
 * every note and enforcing the difference in review, the schema is a
 * discriminated union on `sourceType`: an external note without a URL fails,
 * and an original note claiming an upstream licence fails too.
 */

const commonFields = {
  title: z.string().min(1),
  domain: KnowledgeDomain,
  /**
   * Topics from the controlled vocabulary in topics.ts. Free-form tags would
   * make corpus coverage impossible to compute; see that file.
   */
  tags: z.array(TopicId).min(1),
  summary: z.string().min(1).max(300),
};

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

const externalFields = {
  /** Canonical location of the upstream source. Reachability is checked separately. */
  url: z.url(),
  author: z.string().min(1),
  /** Publication date, at the precision the source itself states. */
  published: PartialDate,
  /** When the source was last consulted for this note. */
  retrieved: z.iso.date(),
  /**
   * Licence or quotation constraint. Required for external sources because the
   * corpus stores excerpts from them.
   */
  license: z.string().min(1),
};

/**
 * A source cannot be retrieved before it was published, and neither date can be
 * in the future. Both are ordinary typos in hand-written frontmatter, and
 * neither is visible to a per-field check.
 */
function checkDates(
  value: { published: string; retrieved: string },
  ctx: z.RefinementCtx,
): void {
  const today = new Date().toISOString().slice(0, 10);

  /**
   * Compared on the shared prefix, so a year-only `published` is not read as
   * 1 January: `2026` against a `2026-03-04` retrieval is consistent, not a
   * violation.
   */
  const shared = Math.min(value.published.length, value.retrieved.length);
  if (value.retrieved.slice(0, shared) < value.published.slice(0, shared)) {
    ctx.addIssue({
      code: 'custom',
      message: `retrieved (${value.retrieved}) is before published (${value.published})`,
      path: ['retrieved'],
    });
  }
  for (const field of ['published', 'retrieved'] as const) {
    if (value[field] > today) {
      ctx.addIssue({
        code: 'custom',
        message: `${field} (${value[field]}) is in the future`,
        path: [field],
      });
    }
  }
}

const external = (sourceType: 'paper' | 'specification' | 'documentation') =>
  z.strictObject({ sourceType: z.literal(sourceType), ...commonFields, ...externalFields })
    .superRefine(checkDates);

export const NoteFrontmatter = z.discriminatedUnion('sourceType', [
  external('paper'),
  external('specification'),
  external('documentation'),
  z.strictObject({
    sourceType: z.literal('original'),
    ...commonFields,
    /** Author of the note itself. */
    author: z.string().min(1),
    /** When the note was written or last revised. */
    revised: z.iso.date(),
  }),
]);

export type NoteFrontmatter = z.infer<typeof NoteFrontmatter>;
export type SourceType = NoteFrontmatter['sourceType'];

/** Derived from the union at runtime, for the same reason as `CARD_TYPES`. */
export const SOURCE_TYPES: readonly SourceType[] = NoteFrontmatter.options.map(
  (option) => option.shape.sourceType.value,
);

/**
 * Every field name the schema accepts, per source type. The corpus-version
 * sensitivity test iterates this rather than a hand-written list, so a field
 * added to the schema is covered without anyone remembering to add it.
 */
export function frontmatterFields(sourceType: SourceType): readonly string[] {
  const option = NoteFrontmatter.options.find(
    (candidate) => candidate.shape.sourceType.value === sourceType,
  );
  if (option === undefined) throw new Error(`Unknown source type: ${sourceType}`);
  return Object.keys(option.shape);
}

/** Source types that carry an upstream `url` worth checking for reachability. */
export function hasCanonicalUrl(
  frontmatter: NoteFrontmatter,
): frontmatter is Extract<NoteFrontmatter, { url: string }> {
  return frontmatter.sourceType !== 'original';
}
