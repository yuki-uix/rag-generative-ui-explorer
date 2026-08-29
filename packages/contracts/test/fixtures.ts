import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixtureDir = resolve(import.meta.dirname, '../../../schemas/__fixtures__');

export function loadFixtures(kind: 'valid' | 'invalid'): Array<[string, unknown]> {
  const dir = resolve(fixtureDir, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => [file.replace(/\.json$/, ''), JSON.parse(readFileSync(resolve(dir, file), 'utf8'))]);
}

/**
 * Cross-field rules that JSON Schema cannot express. Zod is the authoritative
 * gate; the generated JSON Schema is a shape contract only.
 *
 * Kept here so the gap is enumerated rather than assumed. See README.md.
 */
export const ZOD_ONLY_FIXTURES = new Set([
  'comparison-row-value-mismatch',
  'duplicate-card-ids',
  'action-references-unknown-card',
]);
