import type { Evidence } from '@rgux/contracts';
import type { Candidate, Retriever } from './retriever.js';
import { tokenise } from './tokeniser.js';

/**
 * BM25 over the ingested chunks, built in process at startup. No database, no
 * network: the inverted index is a map from term to postings list, and scores
 * are computed from it on each query.
 *
 * The scoring shape matters more than the constants, so the two tunables use
 * the conventional defaults and are deliberately not tuned. There is no
 * held-out set to tune against, and tuning against the evaluation questions
 * would contaminate the metric they exist to produce.
 */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** One term's occurrence data for one document (a chunk is a document). */
interface Posting {
  /** Index into the evidence array the retriever was built from. */
  doc: number;
  /** Number of times the term occurs in that document. */
  tf: number;
}

export class BM25Retriever implements Retriever {
  private readonly documentCount: number;
  private readonly evidenceIds: string[];
  private readonly docLengths: number[];
  private readonly avgDocLength: number;
  private readonly postings: Map<string, Posting[]>;

  constructor(evidence: Evidence[]) {
    this.documentCount = evidence.length;
    this.evidenceIds = evidence.map((entry) => entry.id);
    this.docLengths = evidence.map((entry) => tokenise(entry.text).length);
    this.avgDocLength =
      this.documentCount === 0
        ? 0
        : this.docLengths.reduce((sum, length) => sum + length, 0) / this.documentCount;
    this.postings = buildPostings(evidence);
  }

  async search(query: string, k: number): Promise<Candidate[]> {
    // An empty or failed ingestion builds an empty index; searching it returns
    // nothing rather than a partial result that would look complete downstream.
    if (this.documentCount === 0 || k <= 0) return [];

    // The query is treated as a set of terms, not a multiset: BM25 sums over
    // the distinct query terms, so repeating a term in the query does not
    // inflate its own weight.
    const terms = [...new Set(tokenise(query))];
    if (terms.length === 0) return [];

    const scores = new Map<number, number>();
    for (const term of terms) {
      const postings = this.postings.get(term);
      if (postings === undefined) continue;

      const idf = inverseDocumentFrequency(this.documentCount, postings.length);
      for (const { doc, tf } of postings) {
        // Length ratio is guarded so a degenerate all-empty index (never built
        // in practice, since a posting requires a non-empty document) cannot
        // produce NaN, but the guard is explicit rather than incidental.
        const lengthRatio = this.avgDocLength === 0 ? 0 : this.docLengths[doc]! / this.avgDocLength;
        const norm = BM25_K1 * (1 - BM25_B + BM25_B * lengthRatio);
        const contribution = (idf * tf * (BM25_K1 + 1)) / (tf + norm);
        scores.set(doc, (scores.get(doc) ?? 0) + contribution);
      }
    }

    return [...scores.entries()]
      .map(([doc, score]) => ({ evidenceId: this.evidenceIds[doc]!, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/**
 * Smoothed Robertson–Spärck Jones IDF: `ln(1 + (N − df + 0.5) / (df + 0.5))`.
 * The outer `+1` keeps the value positive when a term appears in every
 * document — a term everyone shares contributes almost nothing, but never goes
 * negative — and the `0.5` halves smooth the extremes.
 */
function inverseDocumentFrequency(documentCount: number, documentFrequency: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

/** Builds the inverted index: term -> postings, one posting per document. */
function buildPostings(evidence: Evidence[]): Map<string, Posting[]> {
  const docsByTerm = new Map<string, Map<number, number>>();
  evidence.forEach((entry, doc) => {
    const frequencies = new Map<string, number>();
    for (const term of tokenise(entry.text)) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
    for (const [term, tf] of frequencies) {
      let docs = docsByTerm.get(term);
      if (docs === undefined) {
        docs = new Map();
        docsByTerm.set(term, docs);
      }
      docs.set(doc, tf);
    }
  });

  const postings = new Map<string, Posting[]>();
  for (const [term, docs] of docsByTerm) {
    // Postings are kept in document order.
    postings.set(
      term,
      [...docs.entries()].map(([doc, tf]) => ({ doc, tf })).sort((a, b) => a.doc - b.doc),
    );
  }
  return postings;
}
