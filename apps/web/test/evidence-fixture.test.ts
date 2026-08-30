/**
 * The gate that keeps `fixtures/evidence.json` honest.
 *
 * The Worker cannot call `ingest` at render time — `node:fs` is an empty
 * virtual filesystem in workerd — so the evidence the gallery cites is cut into
 * a checked-in file by `scripts/generate-evidence.ts`. A checked-in artifact
 * can silently go stale against the corpus, which is exactly the kind of drift
 * that would resolve cleanly today and mismeasure nothing visible tomorrow.
 * This re-ingests and requires the file to be byte-identical to what ingest
 * produces for the identifiers the fixtures cite, so the two can never
 * disagree.
 *
 * The comparison is on serialised text, not object equality, for the same
 * reason `serialiseIndex` is deterministic-but-unsorted: key order and
 * formatting are part of the contract here, and byte equality catches any
 * change to them too.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingest } from '@rgux/corpus';
import { CARD_FIXTURES, citedEvidenceIds } from '../fixtures/cards.js';

const knowledgeRoot = resolve(import.meta.dirname, '../../../knowledge');
const fixturePath = resolve(import.meta.dirname, '../fixtures/evidence.json');

const { evidence, errors } = ingest(knowledgeRoot);

describe('the committed evidence fixture', () => {
  it('ingests the corpus without errors', () => {
    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('is byte-identical to what ingest produces for every cited identifier', () => {
    const cited = new Set(CARD_FIXTURES.flatMap(citedEvidenceIds));
    const expected = evidence.filter((entry) => cited.has(entry.id));
    const committed = readFileSync(fixturePath, 'utf8');

    // Not empty: an empty fixture would satisfy the equality check while
    // resolving nothing, which is a silent failure, not a pass.
    expect(expected.length).toBeGreaterThan(0);
    expect(committed).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });
});
