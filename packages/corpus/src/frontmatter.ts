import { z } from 'zod';

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

export const KnowledgeDomain = z.enum(['rag', 'generative-ui', 'intersection']);

const commonFields = {
  title: z.string().min(1),
  domain: KnowledgeDomain,
  /** Topic tags, used to check corpus coverage against KNOWLEDGE_SCOPE. */
  tags: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1).max(300),
};

const ExternalSource = {
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

export const NoteFrontmatter = z.discriminatedUnion('sourceType', [
  z.strictObject({ sourceType: z.literal('paper'), ...commonFields, ...ExternalSource }),
  z.strictObject({ sourceType: z.literal('specification'), ...commonFields, ...ExternalSource }),
  z.strictObject({ sourceType: z.literal('documentation'), ...commonFields, ...ExternalSource }),
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
export type KnowledgeDomain = z.infer<typeof KnowledgeDomain>;
export type SourceType = NoteFrontmatter['sourceType'];

/** Derived from the union at runtime, for the same reason as `CARD_TYPES`. */
export const SOURCE_TYPES: readonly SourceType[] = NoteFrontmatter.options.map(
  (option) => option.shape.sourceType.value,
);

/** Source types that carry an upstream `url` worth checking for reachability. */
export function hasCanonicalUrl(
  frontmatter: NoteFrontmatter,
): frontmatter is Extract<NoteFrontmatter, { url: string }> {
  return frontmatter.sourceType !== 'original';
}
