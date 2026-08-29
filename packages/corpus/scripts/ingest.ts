/**
 * Ingests knowledge/ into the evidence index retrieval will serve.
 *
 * Prints the serialised Evidence[] to stdout, so the index can be inspected,
 * diffed against a previous run, or piped into a store. A summary goes to
 * stderr. `--text` prints one line per chunk instead, matching `corpus:chunks`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingest, serialiseIndex } from '../src/ingest.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const { evidence, corpusVersion, errors } = ingest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  for (const error of errors) console.error(error.message);
  process.exit(1);
}

if (process.argv.includes('--text')) {
  for (const entry of evidence) {
    const heading = entry.section ?? '(body)';
    console.log(
      `${entry.id}\t${entry.documentTitle}\t${heading}\t${entry.text.replace(/\s+/g, ' ').slice(0, 110)}`,
    );
  }
} else {
  process.stdout.write(serialiseIndex(evidence));
}

const documents = new Set(evidence.map((entry) => entry.documentId)).size;
console.error(`\n${evidence.length} evidence chunk(s) across ${documents} document(s)`);
console.error(`corpus version ${corpusVersion}`);
