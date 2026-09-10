import type { Evidence } from '@rgux/contracts';
import { CardGallery } from '@/components/cards/card-gallery';
import { gatedFixtures } from '@/fixtures/cards';
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
  // Even the fixtures go through the gate: the gallery has no privileged path
  // to the renderer that a live answer would not also take.
  //
  // The brand is a compile-time claim and does not survive serialisation. It
  // holds here because the gate runs on this side of the RSC boundary and the
  // server is what serialises the props. Anything that arrives already
  // serialised — a fetch body, a stored run result (M5) — has no brand on it
  // and must be put back through `gate` before it reaches a component, not
  // asserted into the type.
  return <CardGallery cards={gatedFixtures(evidence)} evidence={evidence} />;
}
