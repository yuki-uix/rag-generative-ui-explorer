/**
 * Generates `fixtures/evidence.json` — the subset of the corpus the card
 * gallery cites, materialised at build time so the Worker can resolve citations
 * without a filesystem.
 *
 * `ingest` reads `knowledge/` with `node:fs`. The vinext app runs in workerd,
 * where `node:fs` has an empty virtual filesystem, so the page cannot call
 * `ingest` at render time (it fails with `readdir '/knowledge'` under both dev
 * and prod). The evidence the gallery needs is therefore cut here, in Node, and
 * checked in. The gate that keeps the checked-in file honest — byte-identical
 * to a fresh ingest — is `test/evidence-fixture.test.ts`, not this script: this
 * script only writes.
 *
 * Run `pnpm --filter @rgux/web evidence:build` after changing the card fixtures
 * or the corpus, and commit the result.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingest } from '@rgux/corpus';
import { CARD_FIXTURES, citedEvidenceIds } from '../fixtures/cards.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const { evidence, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  for (const error of errors) console.error(error.message);
  process.exit(1);
}

const cited = new Set(CARD_FIXTURES.flatMap(citedEvidenceIds));
const selected = evidence.filter((entry) => cited.has(entry.id));

const out = resolve(here, '../fixtures/evidence.json');
writeFileSync(out, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');
console.log(`wrote ${selected.length} cited evidence chunk(s) of ${evidence.length} to ${out}`);
