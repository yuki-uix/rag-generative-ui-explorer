import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { KNOWLEDGE_DOMAINS } from './domain.js';
import type { NoteFrontmatter } from './frontmatter.js';
import { parseNote, NoteError } from './note.js';
import { CHUNKING } from './chunks.js';

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
  /** Section slugs this source supports; see UNSOURCED_SECTIONS. */
  supports: z.array(z.string()),
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
   * Derived entirely from note content, note metadata, and the chunking
   * parameters. Two checkouts with the same notes produce the same version;
   * changing any note changes it, and so does re-chunking — a re-chunk moves
   * every evidence identifier, which is a corpus change rather than a
   * configuration tweak.
   */
  corpusVersion: z.string().regex(/^corpus-[0-9a-f]{12}$/),
  /** Recorded so a stored evidence identifier can be traced to how it was cut. */
  chunking: z.strictObject({
    boundary: z.string().min(1),
    maxChunkChars: z.number().int().positive(),
  }),
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

/**
 * Phrases that assert verification work exists.
 *
 * The corpus is this system's evidence base, so a note claiming "a test asserts
 * X" is a claim the system will later retrieve, cite, and present as grounded —
 * passing every mechanical check while being false, which is precisely the
 * failure the corpus exists to argue against. Review found thirty-four notes
 * describing unbuilt milestones in the present tense.
 *
 * The gate is deliberately narrow. It catches the indicative form only; the
 * gerund ("requires a test asserting X") describes a specification and is
 * allowed. Broader tense checking would need a maintained inventory of what is
 * built, which would go stale faster than the prose it guards.
 */
const ASSERTION_CLAIMS = [
  /\ba test asserts\b/i,
  /\btests assert\b/i,
  /\bis asserted by\b/i,
  /\bare asserted by\b/i,
];

function checkNoVerificationClaims(relativePath: string, body: string): NoteError | undefined {
  const offending = ASSERTION_CLAIMS.map((pattern) => pattern.exec(body)).find(
    (match) => match !== null,
  );
  if (offending == null) return undefined;

  return new NoteError(
    relativePath,
    `claims verification work exists ("${offending[0]}"). Corpus notes describe ` +
      'design intent; implementation status lives in issues and code. Use the ' +
      'gerund ("a test asserting ...") to describe a specification.',
  );
}

/**
 * Sections that legitimately rest on no external source: the repository's own
 * analysis, present in almost every note.
 *
 * A named constant rather than a per-note flag, deliberately. A note able to
 * exempt itself would exempt whatever its author found inconvenient, which is
 * the failure this check exists to prevent rather than a way of handling it.
 */
export const UNSOURCED_SECTIONS = {
  /** Present in almost every note, and never an explication of a source. */
  everywhere: ['what-this-means-here', 'what-this-project-defers'] as readonly string[],
  /**
   * `documentId#section` -> why it rests on no external source. Keyed per note
   * rather than per slug: a slug exempted globally would exempt every note that
   * happens to reuse the heading, which is how a precise judgement decays into
   * a blanket one.
   */
  specific: {
    "generative-ui/component-registries#what-the-registry-cannot-fix":
      "the registry's limit, argued from the pattern rather than documented by it",
    "generative-ui/levels-of-generation#content":
      "the lowest rung of a taxonomy this repository draws",
    "generative-ui/levels-of-generation#behaviour":
      "a rung of the same taxonomy; no cited source names this level",
    "generative-ui/levels-of-generation#the-levels-are-not-a-ladder":
      "the taxonomy's own caveat",
    "generative-ui/predictability-and-user-control#learning-requires-repetition":
      "a consequence of variation, argued here rather than cited",
    "generative-ui/predictability-and-user-control#visual-authority-is-a-claim":
      "this project's central worry about structured presentation",
    "generative-ui/sandboxed-html-generation#what-no-sandbox-gives-back":
      "what containment does not confer, argued from what the mechanisms do",
    "generative-ui/state-continuity#the-problem-in-its-simplest-form":
      "a worked example of this system, not of any source",
    "generative-ui/state-continuity#the-distinction-to-hold":
      "the derived versus authored split this repository draws",
    "generative-ui/state-continuity#why-it-gets-lost-by-default":
      "implementation reasoning, not drawn from a source",
    "generative-ui/streaming-and-incremental-rendering#streaming-status-is-not-streaming-content":
      "a third option this repository names",
    "generative-ui/streaming-and-incremental-rendering#retraction-is-the-cost-people-underestimate":
      "the cost argument, made here",
    "generative-ui/what-generative-ui-is#what-changes-along-the-spectrum":
      "the four consequences are this repository's analysis",
    "generative-ui/what-generative-ui-is#the-distinction-the-term-obscures":
      "a criticism of the term, made here",
    "intersection/card-state-across-turns#three-states-and-only-one-is-disposable":
      "this system's state model",
    "intersection/card-state-across-turns#evidence-identity-underneath":
      "follows from this project's identifier rule",
    "intersection/comparing-presentation-modes#pinning-the-experiment":
      "experiment discipline, not drawn from a source",
    "intersection/field-level-citation#the-property-structure-adds":
      "the argument for structured output, made here",
    "intersection/field-level-citation#what-it-cannot-do":
      "the limit of the mechanism, argued here",
    "intersection/not-overstating-weak-evidence#structure-removes-the-hedge":
      "the core claim of this note, argued rather than cited",
    "intersection/not-overstating-weak-evidence#where-the-interface-has-to-be-willing-to-look-worse":
      "three design rules this repository proposes",
    "intersection/ui-driven-retrieval#the-division-that-matters":
      "the local versus agent split this system draws",
    "intersection/ui-driven-retrieval#a-ui-action-is-a-better-query-than-a-rephrased-question":
      "the payoff argued here, not reported by a source",
    "intersection/ui-driven-retrieval#what-a-follow-up-must-not-break":
      "two implementation failures named here",
    "rag/advanced-patterns#choosing":
      "adoption advice over the four patterns above",
    "rag/context-assembly#what-assembly-has-to-preserve":
      "what a citing system needs from assembly, argued here",
    "rag/dense-retrieval#where-it-fails":
      "failure analysis mirroring the sparse-retrieval note",
    "rag/failure-modes#distinguishing-them":
      "diagnostic ordering over modes covered individually",
    "rag/query-transformation#what-each-one-can-break":
      "failure analysis of the three transformations",
    "rag/query-transformation#keeping-the-original":
      "a mitigation this repository proposes",
  } as Record<string, string>,
};

/** `## Heading text` becomes `heading-text`, matching the evidence ID rule. */
function headingSlugs(body: string): string[] {
  return [...body.matchAll(/^##\s+(.+)$/gm)].map((match) =>
    match[1]!
      .trim()
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  );
}

/**
 * Checks the relationship between sources and sections in both directions.
 *
 * Over-citation: a source claiming a section that does not exist. Review found
 * a note citing a protocol's documentation and drawing on it nowhere.
 *
 * Under-citation: a section no source claims. Review found a note whose three
 * of six sections covered papers it never cited.
 */
function checkSourceSupport(
  relativePath: string,
  frontmatter: NoteFrontmatter,
  body: string,
): NoteError[] {
  if (frontmatter.sources.length === 0) return [];

  const sections = headingSlugs(body);
  const known = new Set(sections);
  const errors: NoteError[] = [];
  const claimed = new Set<string>();

  for (const source of frontmatter.sources) {
    for (const slug of source.supports) {
      if (!known.has(slug)) {
        errors.push(
          new NoteError(
            relativePath,
            `source "${source.title}" claims to support section "${slug}", which does not exist`,
          ),
        );
      }
      claimed.add(slug);
    }
  }

  const documentId = documentIdFor(relativePath);

  /**
   * Only corpus notes owe every section a source. The template's sections are
   * authoring instructions rather than knowledge, so it is checked for
   * over-claiming — a `supports` slug matching no heading — and not for
   * coverage.
   */
  if (!isCorpusNote(relativePath)) return errors;

  for (const slug of sections) {
    if (claimed.has(slug)) continue;
    if (UNSOURCED_SECTIONS.everywhere.includes(slug)) continue;
    if (`${documentId}#${slug}` in UNSOURCED_SECTIONS.specific) continue;
    errors.push(
      new NoteError(
        relativePath,
        `section "${slug}" is claimed by no source. Cite what it draws on, or ` +
          `record "${documentId}#${slug}" in UNSOURCED_SECTIONS.specific with a ` +
          'reason if it rests on no external source.',
      ),
    );
  }

  /**
   * An exemption for a section that is in fact claimed is a standing permission
   * rather than a judgement, so it fails rather than being ignored.
   */
  for (const key of Object.keys(UNSOURCED_SECTIONS.specific)) {
    const [doc, slug] = key.split('#') as [string, string];
    if (doc === documentId && claimed.has(slug)) {
      errors.push(
        new NoteError(
          relativePath,
          `"${key}" is exempted from needing a source, but a source claims it. Remove the exemption.`,
        ),
      );
    }
  }

  return errors;
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

    const overclaim = checkNoVerificationClaims(relativePath, body);
    if (overclaim !== undefined) {
      errors.push(overclaim);
      continue;
    }

    const supportProblems = checkSourceSupport(relativePath, frontmatter, body);
    if (supportProblems.length > 0) {
      errors.push(...supportProblems);
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
          supports: [...source.supports].sort(),
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

  const chunking = { boundary: CHUNKING.boundary as string, maxChunkChars: CHUNKING.maxChunkChars as number };

  return {
    manifest: {
      corpusVersion: `corpus-${hash([canonical(chunking), ...fingerprints].join('\n'), 12)}`,
      chunking,
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
