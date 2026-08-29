import { makeEvidenceId } from '@rgux/contracts';

/**
 * Splits note bodies into the chunks that evidence identifiers address.
 *
 * This is a pure function of the corpus: no model, no embeddings, no retrieval.
 * It lives here rather than in the M1 ingestion pipeline because the golden
 * evidence labels in `eval/` must resolve against a chunk set that exists
 * before any retrieval does — a labelled identifier that cannot be checked is
 * the kind of plausible-looking placeholder this project exists to reject.
 *
 * Ingestion consumes this rather than redefining it. Two chunkers would drift,
 * and the drift would be invisible: labels would resolve against one and
 * retrieval would serve the other.
 */

/**
 * Chunking parameters. Changing either invalidates every stored evidence
 * identifier, so they travel in the manifest and therefore in the corpus
 * version — a re-chunk is a corpus change, not a configuration tweak.
 */
export const CHUNKING = {
  /**
   * Boundaries follow `##` headings. Notes are written one idea per section, so
   * a section is already the unit an author delimited and a reader can locate.
   */
  boundary: 'h2-section',
  /**
   * A section longer than this is split at paragraph boundaries. The cap is
   * generous: splitting is the exception, and a chunk that spans a whole
   * section keeps its citation locatable by heading alone.
   */
  maxChunkChars: 1200,
} as const;

export interface Chunk {
  evidenceId: string;
  documentId: string;
  /** The `##` heading this chunk sits under, or undefined before the first one. */
  section: string | undefined;
  /** Zero-based position within the section. */
  chunkIndex: number;
  text: string;
}

interface Section {
  heading: string | undefined;
  paragraphs: string[];
}

/** Splits a note body into its `##` sections, discarding the `#` title line. */
function sectionsOf(body: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: undefined, paragraphs: [] };

  for (const block of body.split(/\n{2,}/)) {
    const text = block.trim();
    if (text === '') continue;

    if (text.startsWith('# ')) continue; // the note title, carried in frontmatter

    const heading = /^##\s+(.+)$/.exec(text);
    if (heading) {
      if (current.paragraphs.length > 0) sections.push(current);
      current = { heading: heading[1]!.trim(), paragraphs: [] };
      continue;
    }

    current.paragraphs.push(text);
  }

  if (current.paragraphs.length > 0) sections.push(current);
  return sections;
}

/**
 * Groups a section's paragraphs into chunks, starting a new one only when
 * adding the next paragraph would exceed the cap. A single paragraph longer
 * than the cap becomes its own chunk rather than being cut mid-sentence:
 * a citation pointing into the middle of a sentence is worse than a long one.
 */
function groupParagraphs(paragraphs: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;

  for (const paragraph of paragraphs) {
    const added = current.length === 0 ? paragraph.length : length + 2 + paragraph.length;
    if (current.length > 0 && added > CHUNKING.maxChunkChars) {
      chunks.push(current.join('\n\n'));
      current = [paragraph];
      length = paragraph.length;
    } else {
      current.push(paragraph);
      length = added;
    }
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));
  return chunks;
}

export function chunkNote(documentId: string, body: string): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of sectionsOf(body)) {
    groupParagraphs(section.paragraphs).forEach((text, chunkIndex) => {
      chunks.push({
        evidenceId: makeEvidenceId({
          documentId,
          section: section.heading,
          chunkIndex,
          text,
        }),
        documentId,
        section: section.heading,
        chunkIndex,
        text,
      });
    });
  }

  return chunks;
}
