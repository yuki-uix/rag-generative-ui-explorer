import type { Evidence } from '@rgux/contracts';
import { CardGallery } from '@/components/cards/card-gallery';
import evidenceJson from '@/fixtures/evidence.json';

/**
 * A gallery of the five card components and the states the renderer owns (#18),
 * now resolving real evidence (#19). There is still no retrieval and no model
 * here: the planner is #23, and the conversation shell is a separate slice.
 *
 * The evidence is a build-time artifact, not a render-time `ingest`. `ingest`
 * reads the corpus with `node:fs`, and this page runs in workerd, where
 * `node:fs` is an empty virtual filesystem — calling it here fails with
 * `readdir '/knowledge'` in both dev and prod. `scripts/generate-evidence.ts`
 * cuts the cited passages into `fixtures/evidence.json` in Node, and
 * `test/evidence-fixture.test.ts` keeps that file byte-identical to a fresh
 * ingest. The page imports the file, so the browser and Worker bundles never
 * see the corpus at all.
 */
const evidence = evidenceJson as readonly Evidence[];

export default function CardGalleryPage() {
  return <CardGallery evidence={evidence} />;
}
