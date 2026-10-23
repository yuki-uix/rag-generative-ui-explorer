import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { sha, readJSON, verifyControlFreeze } from './image-review.js';
import { safePath, directoryBytes } from './image-experiment.js';
/** Companion post-run seal. The original frozen scoring module is unchanged. */
export function verifyReviewObservations(root: string) {
  const inputs = verifyControlFreeze(root);
  const hash = z.string().regex(/^[a-f0-9]{64}$/);
  const ledger = z.strictObject({ version: z.literal('image-control-ledger-1'), sealedAt: z.iso.datetime(), freezeSha256: hash, files: z.record(z.string(), hash) }).parse(readJSON(resolve(root, 'observations.json')));
  if (ledger.freezeSha256 !== inputs.freezeSha256) throw new Error('Review ledger/freeze mismatch.');
  const expected = ['artifacts/encoding.json', 'artifacts/ocr.json', ...[1, 2, 3].map(i => `artifacts/pass-${i}.f32`),
    'results/2026-10-22/records.jsonl', 'results/2026-10-22/summary.json', 'results/2026-10-22/gold-audit.json'].sort();
  if (JSON.stringify(Object.keys(ledger.files).sort()) !== JSON.stringify(expected)) throw new Error('Incomplete review observation ledger.');
  for (const [path, fingerprint] of Object.entries(ledger.files)) if (sha(readFileSync(safePath(root, path))) !== fingerprint) throw new Error('Review observation changed.');
  if (directoryBytes(root) > inputs.config.artifactBudgetBytes) throw new Error('Review corpus exceeds its 3 MiB artifact budget.');
  return ledger;
}
