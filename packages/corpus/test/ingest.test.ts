/**
 * Runs against the real `knowledge/` directory, not a fixture: the acceptance
 * check is that the ingested evidence is the chunk set the golden labels
 * resolve against, and a fixture would assert whatever the test happened to
 * want. Every check here fails if ingestion diverges from `chunkNote`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Evidence, parseEvidenceId, slugify } from '@rgux/contracts';
import { ingest, serialiseIndex } from '../src/ingest.js';
import { buildManifest } from '../src/manifest.js';
import { parseNote } from '../src/note.js';
import { chunkNote } from '../src/chunks.js';
import { parseEvalSet } from '../src/eval-set.js';
import { corpus, cleanUpCorpora } from './support/corpus.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const knowledgeRoot = resolve(repoRoot, 'knowledge');

afterAll(cleanUpCorpora);

describe('the ingested index', () => {
  const { evidence, errors } = ingest(knowledgeRoot);

  it('builds without errors', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('validates every entry against the Evidence contract', () => {
    for (const entry of evidence) {
      expect(Evidence.safeParse(entry).success).toBe(true);
    }
  });

  it('titles every entry by its note, never by a source', () => {
    const { manifest } = buildManifest(knowledgeRoot);
    const titles = new Map(manifest.documents.map((document) => [document.documentId, document.title]));
    for (const entry of evidence) {
      expect(entry.documentTitle).toBe(titles.get(entry.documentId));
    }
  });

  it('populates section exactly where a heading exists', () => {
    for (const entry of evidence) {
      const { sectionSlug } = parseEvidenceId(entry.id);
      if (entry.section === undefined) {
        expect(sectionSlug).toBe('body');
      } else {
        expect(slugify(entry.section)).toBe(sectionSlug);
      }
    }
  });

  it('leaves url unset and sets retrievalScore to 0, for retrieval to set later', () => {
    for (const entry of evidence) {
      expect(entry.url).toBeUndefined();
      expect(entry.retrievalScore).toBe(0);
    }
  });

  it('carries the note author and domain in metadata', () => {
    const { manifest } = buildManifest(knowledgeRoot);
    const byId = new Map(manifest.documents.map((document) => [document.documentId, document]));
    for (const entry of evidence) {
      const document = byId.get(entry.documentId)!;
      expect(entry.metadata.author).toBe(document.author);
      expect(entry.metadata.category).toBe(document.domain);
    }
  });

  it('produces exactly the chunk set corpus:chunks reports', () => {
    const { manifest } = buildManifest(knowledgeRoot);
    const chunkIds = manifest.documents.flatMap((document) =>
      chunkNote(
        document.documentId,
        parseNote(document.path, readFileSync(resolve(repoRoot, document.path), 'utf8')).body,
      ).map((chunk) => chunk.evidenceId),
    );
    expect(evidence.map((entry) => entry.id).sort()).toEqual(chunkIds.sort());
  });

  it('is a superset of every golden evidence ID in eval/questions.jsonl', () => {
    const ids = new Set(evidence.map((entry) => entry.id));
    const { set, problems } = parseEvalSet(
      readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'),
    );

    expect(problems).toEqual([]);
    expect(set).toBeDefined();
    for (const question of set!.questions) {
      for (const evidenceId of question.goldenEvidenceIds) {
        expect(ids.has(evidenceId)).toBe(true);
      }
    }
  });

  it('re-ingests to an identical ID set', () => {
    expect(ingest(knowledgeRoot).evidence.map((entry) => entry.id)).toEqual(
      evidence.map((entry) => entry.id),
    );
  });

  it('re-ingests to a byte-identical index', () => {
    expect(serialiseIndex(ingest(knowledgeRoot).evidence)).toBe(serialiseIndex(evidence));
  });
});

describe('a corpus that does not validate', () => {
  /**
   * The error path had no coverage. Ingestion returning an empty index on a
   * broken note is the behaviour retrieval depends on — serving a partial index
   * would be worse than serving none, because the gap would be invisible.
   */
  const broken = corpus([
    { path: 'rag/fine.md', body: '## The dual encoder\n\nProse.\n\n## What training is doing\n\nMore.' },
    { path: 'rag/broken.md', raw: '# No frontmatter at all\n' },
  ]);

  it('reports the invalid note and ingests nothing', () => {
    const { evidence, errors } = ingest(broken);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/broken\.md/);
    expect(evidence).toEqual([]);
  });

  it('still reports a corpus version, so the failure is attributable', () => {
    expect(ingest(broken).corpusVersion).toMatch(/^corpus-[0-9a-f]{12}$/);
  });
});
