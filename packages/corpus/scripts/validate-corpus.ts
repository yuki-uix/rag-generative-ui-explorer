/**
 * Validates every note under `knowledge/` and regenerates `knowledge/manifest.json`.
 *
 * Offline by default. `--check-urls` additionally requests every canonical URL;
 * the pull-request gate does not pass that flag, because making a merge depend
 * on a third party's uptime produces a check people re-run until it goes green.
 * The scheduled link-check workflow is where reachability is actually watched.
 *
 * Without `--write`, the manifest is compared rather than rewritten, so CI fails
 * when a note changes without the manifest being regenerated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, serialiseManifest } from '../src/manifest.js';
import { coverage } from '../src/coverage.js';
import { checkLinks } from '../src/link-check.js';

const here = dirname(fileURLToPath(import.meta.url));
const knowledgeRoot = resolve(here, '../../../knowledge');
const manifestPath = resolve(knowledgeRoot, 'manifest.json');

const write = process.argv.includes('--write');
const checkUrls = process.argv.includes('--check-urls');

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
  console.log('wrote knowledge/manifest.json');
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

console.log(
  `${manifest.documentCount} document(s), ${manifest.sourceCount} cited source(s), corpus version ${manifest.corpusVersion}`,
);

console.log('\ntopic coverage');
for (const domain of coverage(manifest)) {
  const total = domain.covered.length + domain.uncovered.length;
  console.log(
    `  ${domain.domain.padEnd(15)} ${domain.covered.length}/${total} topics, ${domain.noteCount} note(s)`,
  );
  if (domain.uncovered.length > 0) {
    console.log(`    uncovered: ${domain.uncovered.join(', ')}`);
  }
}

if (checkUrls) {
  console.log('\ncanonical URLs');
  const results = await checkLinks(manifest);
  for (const result of results) {
    const label = result.ok ? 'ok  ' : result.blocked === true ? 'BLOCK' : 'FAIL';
    console.log(
      `  ${label} ${result.documentId}  ${result.url}  ${result.error ?? result.status}`,
    );
  }
  const blocked = results.filter((result) => result.blocked === true);
  const unreachable = results.filter((result) => !result.ok && result.blocked !== true);
  console.log(
    `  ${results.length} checked, ${unreachable.length} unreachable, ${blocked.length} bot-blocked`,
  );
  if (unreachable.length > 0) {
    process.exit(1);
  }
}
