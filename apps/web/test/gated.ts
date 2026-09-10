/**
 * The gated fixtures, for tests that render.
 *
 * `KnowledgeCard` accepts only `GatedCard` (#26), so a test cannot hand it a
 * raw fixture — which is the point: the tests exercise the same path a live
 * answer takes rather than a shortcut around it. The evidence comes from the
 * checked-in `evidence.json` because that is what the page itself resolves
 * against; `evidence-fixture.test.ts` keeps that file honest against a fresh
 * ingest.
 */
import type { Evidence } from '@rgux/contracts';
import evidenceJson from '../fixtures/evidence.json' with { type: 'json' };
import { gatedFixtures } from '../fixtures/cards.js';

export const FIXTURE_EVIDENCE = evidenceJson as unknown as readonly Evidence[];
export const GATED_FIXTURES = gatedFixtures(FIXTURE_EVIDENCE);
