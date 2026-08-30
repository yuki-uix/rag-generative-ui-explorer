/**
 * The retrieval seam.
 *
 * `Retriever` is the interface every retrieval implementation satisfies, and
 * the point at which a database-backed implementation can replace the
 * in-process one without any change above it. Callers depend on `search`, never
 * on how the index is stored or scored. pgvector is deferred until the corpus
 * outgrows an in-process index; when it is introduced, it implements this same
 * interface (see docs/ARCHITECTURE.md).
 */

export interface Candidate {
  /** Evidence ID of a retrieved chunk, as produced by ingestion. */
  evidenceId: string;
  /** Retrieval score; higher is more relevant. Only comparable within one call. */
  score: number;
}

export interface Retriever {
  /**
   * Returns up to `k` candidates ranked by descending score.
   *
   * Asynchronous because retrieval that is not in-process cannot be anything
   * else. The synchronous version of this signature was written when BM25 was
   * the only implementation, alongside a claim that a database-backed retriever
   * could substitute in without changing anything above the seam. That claim
   * was false: a database call is async, and so is embedding a query. Dense
   * retrieval is what surfaced it, which is the argument for building the
   * second implementation before trusting a seam rather than after.
   */
  search(query: string, k: number): Promise<Candidate[]>;
}
