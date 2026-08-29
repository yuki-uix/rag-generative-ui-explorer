/**
 * Requests every canonical URL in the manifest and reports the ones that do not
 * resolve. Network-dependent, so it runs on a schedule rather than in the
 * pull-request gate.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Manifest } from '../src/manifest.js';
import { checkLinks } from '../src/link-check.js';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, '../../../knowledge/manifest.json');

const manifest = Manifest.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));

const results = await checkLinks(manifest);
const unreachable = results.filter((result) => !result.ok);

for (const result of results) {
  const detail = result.error ?? String(result.status);
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.documentId}  ${result.url}  ${detail}`);
}

console.log(
  `\n${results.length} URL(s) checked, ${unreachable.length} unreachable, corpus version ${manifest.corpusVersion}`,
);

if (unreachable.length > 0) {
  process.exit(1);
}
