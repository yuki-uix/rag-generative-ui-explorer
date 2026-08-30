/**
 * The bundle the deployed app serves from is a generated artifact, and every
 * generated artifact in this repository has a check that it still matches what
 * produced it. A stale bundle resolves cleanly, ranks plausibly, and answers
 * from a corpus that no longer exists.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingest } from '@rgux/corpus';
import bundle from '../fixtures/retrieval-bundle.json';

const { evidence, corpusVersion, errors } = ingest(
  resolve(import.meta.dirname, '../../../knowledge'),
);
const committed = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../fixtures/retrieval-bundle.json'), 'utf8'),
) as { corpusVersion: string; retrieval: string; evidence: unknown[] };

describe('the retrieval bundle', () => {
  it('was built from the corpus that is here now', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
    expect(committed.corpusVersion).toBe(corpusVersion);
  });

  it('carries every chunk, so the served index is not a subset of the measured one', () => {
    expect(committed.evidence).toHaveLength(evidence.length);
    expect(new Set(bundle.evidence.map((item) => item.id))).toEqual(
      new Set(evidence.map((item) => item.id)),
    );
  });

  /**
   * The served system is lexical while the harness measures dense — 48.9%
   * against 65.9% recall — because dense retrieval embeds the query at request
   * time and that runs onnxruntime, which does not exist in workerd.
   *
   * The artifact records which retrieval the deployment performs so a report
   * cannot attribute a measured number to the served system. But a recorded
   * string is a claim, not a fact: wiring a different retriever into the route
   * would leave it saying `lexical-bm25` and nothing would notice. So the claim
   * is checked against what the route actually constructs.
   */
  it('declares the retrieval the route actually constructs, not a remembered one', () => {
    const route = readFileSync(
      resolve(import.meta.dirname, '../app/api/ask/route.ts'),
      'utf8',
    );

    const constructs = {
      'lexical-bm25': /new BM25Retriever\(/,
      dense: /new DenseRetriever\(/,
      fused: /new FusionRetriever\(/,
    } as const;

    const found = Object.entries(constructs)
      .filter(([, pattern]) => pattern.test(route))
      .map(([name]) => name);

    // Exactly one, and it is the one the artifact names. Two would make the
    // declaration ambiguous; none would mean this test stopped looking at the
    // route that matters.
    expect(found).toEqual([committed.retrieval]);
  });
});
