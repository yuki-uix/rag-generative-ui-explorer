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

export const ManifestDocument = z.strictObject({
  documentId: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  sourceType: z.string().min(1),
  author: z.string().min(1),
  summary: z.string().min(1),
  url: z.string().optional(),
  /**
   * Publication, retrieval, and licence travel into the manifest because
   * freshness and quotation constraints are consumed downstream, not only at
   * authoring time.
   */
  published: z.string().optional(),
  retrieved: z.string().optional(),
  license: z.string().optional(),
  revised: z.string().optional(),
  tags: z.array(z.string()),
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
  documents: z.array(ManifestDocument),
});

export type Manifest = z.infer<typeof Manifest>;
export type ManifestDocument = z.infer<typeof ManifestDocument>;

function hash(input: string, length: number): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, length);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Key-sorted JSON, so the hash does not depend on YAML key order. */
function canonical(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
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

    if (!isCorpusNote(relativePath)) continue;

    const misplaced = checkDomainMatchesDirectory(relativePath, frontmatter);
    if (misplaced !== undefined) {
      errors.push(misplaced);
      continue;
    }

    const contentHash = hash(normalise(body), 16);
    const metadataHash = hash(canonical(frontmatter as unknown as Record<string, unknown>), 16);
    const documentId = documentIdFor(relativePath);

    documents.push(
      ManifestDocument.parse({
        documentId,
        path: `knowledge/${segments(relativePath).join('/')}`,
        title: frontmatter.title,
        domain: frontmatter.domain,
        sourceType: frontmatter.sourceType,
        author: frontmatter.author,
        summary: frontmatter.summary,
        ...('url' in frontmatter ? { url: frontmatter.url } : {}),
        ...('published' in frontmatter ? { published: frontmatter.published } : {}),
        ...('retrieved' in frontmatter ? { retrieved: frontmatter.retrieved } : {}),
        ...('license' in frontmatter ? { license: frontmatter.license } : {}),
        ...('revised' in frontmatter ? { revised: frontmatter.revised } : {}),
        tags: [...frontmatter.tags].sort(),
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
      documents,
    },
    errors,
  };
}

export function serialiseManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
