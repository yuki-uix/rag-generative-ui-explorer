/**
 * The retriever's unit tests run over a small fixed corpus built by hand, so
 * each expected ordering can be read off the fixture and its reason named.
 * Every assertion goes through `search`, the real entry point — none of these
 * tests re-implements the scoring to produce the "expected" value.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Evidence } from '@rgux/contracts';
import type { Candidate, Retriever } from '../src/retriever.js';
import { BM25Retriever } from '../src/bm25.js';
import { ingest } from '../src/ingest.js';
import { corpus, cleanUpCorpora } from './support/corpus.js';

afterEach(cleanUpCorpora);

/** A minimal valid Evidence entry, for fixtures whose text the test controls. */
function doc(documentId: string, text: string): Evidence {
  return Evidence.parse({
    id: `${documentId}#body#0-abcdef01`,
    documentId,
    documentTitle: documentId,
    text,
    retrievalScore: 0,
    metadata: {},
  });
}

describe('BM25Retriever', () => {
  it('saturates term frequency: ten occurrences outrank one, but not by ten times', async () => {
    // Same length (10 tokens each), so length normalisation does not interfere:
    // the only difference between the first two chunks is how often "apple"
    // occurs. The third chunk is a distractor that never contains it.
    const retriever = new BM25Retriever([
      doc('doc-many', 'apple apple apple apple apple apple apple apple apple apple'),
      doc('doc-once', 'apple zero one two three four five six seven eight'),
      doc('doc-other', 'banana'),
    ]);

    const [top, second] = await retriever.search('apple', 3);

    expect(top!.evidenceId).toBe('doc-many#body#0-abcdef01');
    expect(second!.evidenceId).toBe('doc-once#body#0-abcdef01');

    // Saturation, the point of k1: tf=10 scores about 0.89 against tf=1's 0.40,
    // roughly 2.2x higher — clearly more relevant, clearly not ten times more.
    // A linear tf-idf would reward the repetition tenfold.
    expect(top!.score).toBeGreaterThan(second!.score);
    expect(top!.score).toBeLessThan(second!.score * 10);
  });

  it('normalises document length: the same term count ranks shorter chunks higher', async () => {
    // One "apple" each; the only difference is total length (2 vs 9 tokens). A
    // long chunk contains more terms by accident, so with equal evidence it
    // must rank lower.
    const retriever = new BM25Retriever([
      doc('doc-short', 'apple banana'),
      doc('doc-long', 'apple banana cherry date elder fig grape honey'),
    ]);

    expect((await retriever.search('apple', 2)).map((candidate) => candidate.evidenceId)).toEqual([
      'doc-short#body#0-abcdef01',
      'doc-long#body#0-abcdef01',
    ]);
  });

  it('weights inverse document frequency: a rare term discriminates far more', async () => {
    // Four one-token chunks, so length and tf are identical across the board;
    // the only thing that differs is how many chunks share each term.
    const retriever = new BM25Retriever([
      doc('doc-rare', 'rare'),
      doc('doc-common-1', 'common'),
      doc('doc-common-2', 'common'),
      doc('doc-common-3', 'common'),
    ]);

    const rare = await retriever.search('rare', 4);
    const common = await retriever.search('common', 4);

    expect(rare.map((candidate) => candidate.evidenceId)).toEqual(['doc-rare#body#0-abcdef01']);
    expect(common).toHaveLength(3);

    // `rare` is in 1 of 4 chunks, `common` in 3 of 4. The single occurrence of
    // a discriminating term scores far above a single occurrence of a term
    // almost everyone shares (idf ≈ 1.20 vs ≈ 0.36).
    expect(rare[0]!.score).toBeGreaterThan(common[0]!.score * 2);
  });

  it('scores a single exact match by the smoothed IDF', async () => {
    const retriever = new BM25Retriever([doc('doc-single', 'apple')]);

    const [result] = await retriever.search('apple', 1);

    // N=1, df=1: idf = ln(1 + (1 - 1 + 0.5)/(1 + 0.5)) = ln(4/3).
    // tf=1, len=1, avgdl=1: norm = k1 * (1 - b + b) = 1.2, and the term
    // factor tf*(k1+1)/(tf + norm) = 2.2/2.2 = 1, so the score is idf alone.
    expect(result!.score).toBeCloseTo(0.287682, 6);
  });

  it('returns nothing from an empty index (empty or failed ingestion)', async () => {
    expect(await new BM25Retriever([]).search('apple', 10)).toEqual([]);
  });

  it('returns nothing for a tokenless query or a non-positive k', async () => {
    const retriever = new BM25Retriever([doc('doc-single', 'apple')]);

    expect(await retriever.search('', 10)).toEqual([]);
    expect(await retriever.search('?!.;=', 10)).toEqual([]);
    expect(await retriever.search('apple', 0)).toEqual([]);
    expect(await retriever.search('apple', -1)).toEqual([]);
  });

  it('serves nothing when ingestion failed, rather than a partial index', async () => {
    const broken = corpus([{ path: 'rag/broken.md', raw: '# No frontmatter at all\n' }]);
    const { evidence, errors } = ingest(broken);

    expect(errors.length).toBeGreaterThan(0);
    expect(evidence).toEqual([]);
    expect(await new BM25Retriever(evidence).search('anything', 10)).toEqual([]);
  });
});

describe('the Retriever seam', () => {
  /** A second implementation of the seam: fixed candidates, no index at all. */
  class StubRetriever implements Retriever {
    constructor(private readonly fixed: Candidate[]) {}

    async search(_query: string, _k: number): Promise<Candidate[]> {
      return this.fixed;
    }
  }

  /** Depends on the interface alone, so any implementation stands in. */
  async function topEvidenceId(
    retriever: Retriever,
    query: string,
    k: number,
  ): Promise<string | undefined> {
    return (await retriever.search(query, k))[0]?.evidenceId;
  }

  it('lets any implementation substitute with no change above the interface', async () => {
    const stub = new StubRetriever([{ evidenceId: 'stub#body#0-abcdef01', score: 1 }]);
    const real = new BM25Retriever([doc('doc-single', 'apple')]);

    expect(await topEvidenceId(stub, 'anything', 3)).toBe('stub#body#0-abcdef01');
    expect(await topEvidenceId(real, 'apple', 3)).toBe('doc-single#body#0-abcdef01');
  });
});

describe('against the real corpus', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const { evidence } = ingest(resolve(repoRoot, 'knowledge'));
  const retriever = new BM25Retriever(evidence);
  const byId = new Map(evidence.map((entry) => [entry.id, entry]));

  it('returns the chunk containing an exact term the corpus is dense with', async () => {
    // Each of these is a term the tokeniser must keep whole (see
    // tokeniser.test.ts). The load-bearing property is literal: the top result
    // for a term must be a chunk whose text actually contains that term.
    for (const term of ['nDCG', 'Recall@10', 'pgvector', 'AG-UI']) {
      const top = (await retriever.search(term, 5))[0]!;
      expect(byId.get(top.evidenceId)!.text.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it('retrieves the one chunk that names pgvector, and checks that premise', async () => {
    // The assertion below is only meaningful while exactly one chunk contains
    // the term, so the premise is checked rather than assumed: a later note
    // mentioning pgvector should fail here as a stale premise, not silently
    // turn this into a test of which of several chunks ranks first.
    const containing = evidence.filter((entry) =>
      entry.text.toLowerCase().includes('pgvector'),
    );
    expect(containing).toHaveLength(1);

    const top = (await retriever.search('pgvector', 3))[0]!;
    expect(top.evidenceId).toBe(containing[0]!.id);
  });

  /**
   * Ranking has to be repeatable, or an evaluation run cannot be compared with
   * the one before it. Equal scores resolve by document order because postings
   * are built in document order and Array.prototype.sort is stable — a property
   * worth a test rather than a comment.
   */
  it('returns identical results for repeated identical queries', async () => {
    for (const query of ['nDCG', 'reciprocal rank fusion', 'how does chunking work']) {
      expect(await retriever.search(query, 10)).toEqual(await retriever.search(query, 10));
    }
  });
});
