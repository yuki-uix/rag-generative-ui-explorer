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

const externalFields = {
  /** Canonical location of the upstream source. Reachability is checked separately. */
  url: z.url(),
  author: z.string().min(1),
  /** Publication date of the upstream source. */
  published: z.iso.date(),
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

  if (value.retrieved < value.published) {
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
