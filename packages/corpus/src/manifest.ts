import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { KNOWLEDGE_DOMAINS } from './domain.js';
import type { NoteFrontmatter } from './frontmatter.js';
import { parseNote, NoteError } from './note.js';

function segments(relativePath: string): string[] {
  return relativePath.split(sep);
}

function basename(relativePath: string): string {
  const parts = segments(relativePath);
  return parts[parts.length - 1] ?? '';
}

/**
 * Files that live under `knowledge/` but are not corpus documents. Directory
 * READMEs explain the folder, and `_`-prefixed files are templates. Both are
 * still parsed and validated, so a broken template fails CI, but neither is
 * ingested or listed in the manifest.
 */
export function isCorpusNote(relativePath: string): boolean {
  const name = basename(relativePath);
  return name.endsWith('.md') && name !== 'README.md' && !name.startsWith('_');
}

function isValidatedFile(relativePath: string): boolean {
  const name = basename(relativePath);
  return name.endsWith('.md') && name !== 'README.md';
}

export const ManifestSource = z.strictObject({
  sourceType: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  author: z.string().min(1),
  published: z.string().min(1).optional(),
  retrieved: z.string().min(1),
  license: z.string().min(1),
  primary: z.boolean(),
});

export const ManifestDocument = z.strictObject({
  documentId: z.string().min(1),
  path: z.string().min(1),
  /** The note's own title, never a source's. See frontmatter.ts. */
  title: z.string().min(1),
  domain: z.string().min(1),
  author: z.string().min(1),
  revised: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()),
  sources: z.array(ManifestSource),
  /** SHA-256 prefix of the note body, whitespace-normalised. */
  contentHash: z.string().length(16),
  /**
   * SHA-256 prefix of the complete frontmatter, not of the fields projected
   * above. Editing any metadata field changes this even if the manifest does
   * not surface that field.
   */
  metadataHash: z.string().length(16),
});

export const Manifest = z.strictObject({
  /**
   * Derived entirely from note content and metadata. Two checkouts with the
   * same notes produce the same version; changing any note changes it.
   */
  corpusVersion: z.string().regex(/^corpus-[0-9a-f]{12}$/),
  documentCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  documents: z.array(ManifestDocument),
});

export type Manifest = z.infer<typeof Manifest>;
export type ManifestDocument = z.infer<typeof ManifestDocument>;
export type ManifestSource = z.infer<typeof ManifestSource>;

function hash(input: string, length: number): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, length);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Key-sorted JSON, so the hash does not depend on YAML key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function walk(dir: string, root: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, root, found);
    } else {
      found.push(relative(root, full));
    }
  }
  return found;
}

/** `rag/hybrid-retrieval.md` becomes `rag/hybrid-retrieval`. */
export function documentIdFor(relativePath: string): string {
  return relativePath.replace(/\.md$/, '').split(sep).join('/');
}

/**
 * A note's declared domain must match the directory it lives in. The directory
 * READMEs said so in prose, which meant nothing checked it: a note under
 * `knowledge/rag/` declaring `domain: generative-ui` validated cleanly and
 * would have been counted towards the wrong domain's coverage.
 */
function checkDomainMatchesDirectory(
  relativePath: string,
  frontmatter: NoteFrontmatter,
): NoteError | undefined {
  const [directory] = segments(relativePath);

  if (directory === undefined || !KNOWLEDGE_DOMAINS.includes(directory as never)) {
    return new NoteError(
      relativePath,
      `corpus notes must live in one of ${KNOWLEDGE_DOMAINS.join(', ')}`,
    );
  }
  if (directory !== frontmatter.domain) {
    return new NoteError(
      relativePath,
      `declares domain "${frontmatter.domain}" but lives in knowledge/${directory}`,
    );
  }
  return undefined;
}

/**
 * The frontmatter title and the note's heading must agree.
 *
 * They diverged once already, in the direction that matters: the frontmatter
 * carried the cited paper's title while the heading carried the note's. Since
 * ingestion reads the frontmatter, every chunk would have been presented under
 * the paper's name.
 */
function checkTitleMatchesHeading(
  relativePath: string,
  frontmatter: NoteFrontmatter,
  body: string,
): NoteError | undefined {
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();

  if (heading === undefined) {
    return new NoteError(relativePath, 'note body has no top-level heading');
  }
  if (heading !== frontmatter.title) {
    return new NoteError(
      relativePath,
      `frontmatter title "${frontmatter.title}" does not match heading "${heading}"`,
    );
  }
  return undefined;
}

export interface BuildResult {
  manifest: Manifest;
  errors: NoteError[];
}

export function buildManifest(knowledgeRoot: string): BuildResult {
  const errors: NoteError[] = [];
  const documents: ManifestDocument[] = [];
  const fingerprints: string[] = [];

  for (const relativePath of walk(knowledgeRoot, knowledgeRoot)) {
    if (!isValidatedFile(relativePath)) continue;

    let frontmatter: NoteFrontmatter;
    let body: string;
    try {
      const source = readFileSync(join(knowledgeRoot, relativePath), 'utf8');
      const parsed = parseNote(relativePath, source);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch (error) {
      errors.push(error as NoteError);
      continue;
    }

    const titleMismatch = checkTitleMatchesHeading(relativePath, frontmatter, body);
    if (titleMismatch !== undefined) {
      errors.push(titleMismatch);
      continue;
    }

    if (!isCorpusNote(relativePath)) continue;

    const misplaced = checkDomainMatchesDirectory(relativePath, frontmatter);
    if (misplaced !== undefined) {
      errors.push(misplaced);
      continue;
    }

    const contentHash = hash(normalise(body), 16);
    const metadataHash = hash(canonical(frontmatter), 16);
    const documentId = documentIdFor(relativePath);

    documents.push(
      ManifestDocument.parse({
        documentId,
        path: `knowledge/${segments(relativePath).join('/')}`,
        title: frontmatter.title,
        domain: frontmatter.domain,
        author: frontmatter.author,
        revised: frontmatter.revised,
        summary: frontmatter.summary,
        tags: [...frontmatter.tags].sort(),
        sources: frontmatter.sources.map((source) => ({
          sourceType: source.sourceType,
          title: source.title,
          url: source.url,
          author: source.author,
          ...(source.published === undefined ? {} : { published: source.published }),
          retrieved: source.retrieved,
          license: source.license,
          primary: source.primary === true,
        })),
        contentHash,
        metadataHash,
      }),
    );

    fingerprints.push(`${documentId} ${contentHash} ${metadataHash}`);
  }

  documents.sort((a, b) => a.documentId.localeCompare(b.documentId));
  fingerprints.sort();

  return {
    manifest: {
      corpusVersion: `corpus-${hash(fingerprints.join('\n'), 12)}`,
      documentCount: documents.length,
      sourceCount: documents.reduce((total, document) => total + document.sources.length, 0),
      documents,
    },
    errors,
  };
}

export function serialiseManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
