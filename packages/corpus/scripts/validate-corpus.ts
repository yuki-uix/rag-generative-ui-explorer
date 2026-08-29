/**
 * Validates every note under `knowledge/` and regenerates `knowledge/manifest.json`.
 *
 * Offline only. Canonical URL reachability is a separate command
 * (`corpus:check-links`) on its own schedule — see src/link-check.ts.
 *
 * Without `--write`, the manifest is compared rather than rewritten, so CI fails
 * when a note changes without the manifest being regenerated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, serialiseManifest } from '../src/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const knowledgeRoot = resolve(repoRoot, 'knowledge');
const manifestPath = resolve(knowledgeRoot, 'manifest.json');

const write = process.argv.includes('--write');

const { manifest, errors } = buildManifest(knowledgeRoot);

for (const error of errors) {
  console.error(`invalid note  ${error.message}`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} note(s) failed metadata validation.`);
  process.exit(1);
}

const serialised = serialiseManifest(manifest);

if (write) {
  writeFileSync(manifestPath, serialised, 'utf8');
  console.log(`wrote knowledge/manifest.json`);
} else {
  let current: string | undefined;
  try {
    current = readFileSync(manifestPath, 'utf8');
  } catch {
    console.error('knowledge/manifest.json is missing. Run `pnpm corpus:build`.');
    process.exit(1);
  }
  if (current !== serialised) {
    console.error('knowledge/manifest.json is out of date. Run `pnpm corpus:build` and commit it.');
    process.exit(1);
  }
  console.log('ok knowledge/manifest.json');
}

console.log(`${manifest.documentCount} document(s), corpus version ${manifest.corpusVersion}`);
