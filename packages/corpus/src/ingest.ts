import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Evidence } from '@rgux/contracts';
import { buildManifest } from './manifest.js';
import { parseNote, NoteError } from './note.js';
import { chunkNote } from './chunks.js';

/**
 * Turns the corpus into the evidence index retrieval will serve.
 *
 * Ingestion is assembly, not analysis. It walks the manifest, re-reads each
 * note, and maps every chunk to an Evidence object; it deliberately does not
 * chunk. Chunking is `chunkNote`, and the golden evidence labels in `eval/`
 * resolve against exactly that chunk set — a second chunker here would drift,
 * and the drift would be invisible: labels would resolve against one and
 * retrieval would serve the other.
 *
 * The chunk's own location is the note, never a cited source, so `url` is left
 * unset. A source's `url` describes what the note draws on; putting it on a
 * chunk would present the repository's own prose under a paper's link (see the
 * corpus README and issue #38). `retrievalScore` is 0 here; retrieval sets it.
 */

export interface IngestResult {
  evidence: Evidence[];
  /** The corpus version the evidence was cut from; same value the manifest carries. */
  corpusVersion: string;
  errors: NoteError[];
}

export function ingest(knowledgeRoot: string): IngestResult {
  const { manifest, errors } = buildManifest(knowledgeRoot);
  if (errors.length > 0) {
    return { evidence: [], corpusVersion: manifest.corpusVersion, errors };
  }

  const evidence: Evidence[] = [];
  for (const document of manifest.documents) {
    const notePath = resolve(knowledgeRoot, `${document.documentId}.md`);
    const { body } = parseNote(document.path, readFileSync(notePath, 'utf8'));

    for (const chunk of chunkNote(document.documentId, body)) {
      evidence.push(
        Evidence.parse({
          id: chunk.evidenceId,
          documentId: document.documentId,
          documentTitle: document.title,
          ...(chunk.section === undefined ? {} : { section: chunk.section }),
          text: chunk.text,
          retrievalScore: 0,
          metadata: { author: document.author, category: document.domain },
        }),
      );
    }
  }

  return { evidence, corpusVersion: manifest.corpusVersion, errors };
}

/** Key-ordered deterministic JSON, so an unchanged corpus re-ingests byte-identically. */
export function serialiseIndex(evidence: Evidence[]): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}
