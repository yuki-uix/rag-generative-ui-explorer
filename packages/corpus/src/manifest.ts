import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import type { NoteFrontmatter } from './frontmatter.js';
import { parseNote, NoteError } from './note.js';

function basename(relativePath: string): string {
  const parts = relativePath.split(sep);
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
  url: z.string().optional(),
  tags: z.array(z.string()),
  /** SHA-256 prefix of the note body, whitespace-normalised. */
  contentHash: z.string().length(16),
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

export interface BuildResult {
  manifest: Manifest;
  errors: NoteError[];
}

export function buildManifest(knowledgeRoot: string): BuildResult {
  const errors: NoteError[] = [];
  const documents: ManifestDocument[] = [];

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

    documents.push(
      ManifestDocument.parse({
        documentId: documentIdFor(relativePath),
        path: `knowledge/${relativePath.split(sep).join('/')}`,
        title: frontmatter.title,
        domain: frontmatter.domain,
        sourceType: frontmatter.sourceType,
        author: frontmatter.author,
        ...('url' in frontmatter ? { url: frontmatter.url } : {}),
        tags: [...frontmatter.tags].sort(),
        contentHash: hash(normalise(body), 16),
      }),
    );
  }

  documents.sort((a, b) => a.documentId.localeCompare(b.documentId));

  /**
   * The fingerprint covers metadata as well as body text. Retagging a note or
   * correcting its author changes what retrieval and evaluation see, so it must
   * change the corpus version even though no prose moved.
   */
  const fingerprint = documents.map((document) => JSON.stringify(document)).join('\n');

  return {
    manifest: {
      corpusVersion: `corpus-${hash(fingerprint, 12)}`,
      documentCount: documents.length,
      documents,
    },
    errors,
  };
}

export function serialiseManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
