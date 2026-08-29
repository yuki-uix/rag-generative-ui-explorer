import { createHash } from 'node:crypto';

/**
 * Evidence IDs are the foundation of grounding validation. They must be stable
 * across re-ingestion, or every stored evaluation label and every logged
 * generation becomes unreplayable.
 *
 * Shape: `{documentId}#{sectionSlug}#{chunkIndex}-{contentHash}`
 *
 * See docs/ARCHITECTURE.md for the rule and its known limitation.
 */
export const EVIDENCE_ID_PATTERN =
  /^[a-z0-9][a-z0-9._/-]*#[a-z0-9][a-z0-9-]*#\d+-[0-9a-f]{8}$/;

export const CONTENT_HASH_LENGTH = 8;

/** Lowercase, ASCII-safe slug used for the section component of an evidence ID. */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'body' : slug;
}

/**
 * Hash of the chunk text alone. Whitespace is normalised so that reflowing a
 * paragraph without changing its words does not rotate the ID.
 */
export function contentHash(text: string): string {
  const normalised = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256')
    .update(normalised, 'utf8')
    .digest('hex')
    .slice(0, CONTENT_HASH_LENGTH);
}

export interface EvidenceIdParts {
  /** Corpus-relative document identifier, e.g. `rag/hybrid-retrieval`. */
  documentId: string;
  /** Heading the chunk belongs to; omitted for text before the first heading. */
  section?: string | undefined;
  /** Zero-based index of the chunk within its section. */
  chunkIndex: number;
  /** The chunk text itself. */
  text: string;
}

export function makeEvidenceId(parts: EvidenceIdParts): string {
  const { documentId, section, chunkIndex, text } = parts;

  if (!/^[a-z0-9][a-z0-9._/-]*$/.test(documentId)) {
    throw new Error(`Invalid documentId for evidence ID: ${JSON.stringify(documentId)}`);
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error(`chunkIndex must be a non-negative integer, received ${chunkIndex}`);
  }
  if (text.trim() === '') {
    throw new Error('Cannot build an evidence ID for empty chunk text');
  }

  const sectionSlug = section === undefined ? 'body' : slugify(section);
  return `${documentId}#${sectionSlug}#${chunkIndex}-${contentHash(text)}`;
}

export interface ParsedEvidenceId {
  documentId: string;
  sectionSlug: string;
  chunkIndex: number;
  contentHash: string;
}

export function parseEvidenceId(id: string): ParsedEvidenceId {
  if (!EVIDENCE_ID_PATTERN.test(id)) {
    throw new Error(`Malformed evidence ID: ${JSON.stringify(id)}`);
  }
  const hashSeparator = id.lastIndexOf('-');
  const [documentId, sectionSlug, chunkIndex] = id
    .slice(0, hashSeparator)
    .split('#') as [string, string, string];

  return {
    documentId,
    sectionSlug,
    chunkIndex: Number(chunkIndex),
    contentHash: id.slice(hashSeparator + 1),
  };
}
