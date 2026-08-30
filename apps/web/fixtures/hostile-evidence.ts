import type { Evidence } from '@rgux/contracts';

/**
 * A renderer fixture whose excerpt tries to smuggle markup past the source
 * drawer. It lives here, not in `knowledge/`, because it is a renderer test:
 * the renderer does not care which directory the text came from, and adding a
 * note to `knowledge/` would rotate the corpus version and invalidate a labelled
 * evaluation set for the sake of one assertion.
 *
 * The identifier satisfies the evidence-ID shape but resolves to no corpus
 * chunk on purpose — nothing should ever look it up against the real index.
 * It is used by `test/source-drawer.test.tsx` to prove the excerpt renders as
 * inert text (see the test for why that proves the property and not a tautology).
 */
export const HOSTILE_EVIDENCE: Evidence = {
  id: 'hostile/fixture#body#0-00000000',
  documentId: 'hostile/fixture',
  documentTitle: 'Hostile fixture',
  section: 'Injection',
  text: 'An excerpt that tries to inject markup: <script>alert("xss")</script> and <img src=x onerror=alert(1)>.',
  retrievalScore: 0,
  metadata: {},
};
