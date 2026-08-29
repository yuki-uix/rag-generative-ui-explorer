/** Lists the corpus chunk set: the evidence identifiers golden labels resolve against. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { parseNote } from '../src/note.js';
import { chunkNote, CHUNKING } from '../src/chunks.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const { manifest, errors } = buildManifest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  for (const error of errors) console.error(error.message);
  process.exit(1);
}

let total = 0;
for (const document of manifest.documents) {
  const { body } = parseNote(document.path, readFileSync(resolve(repoRoot, document.path), 'utf8'));
  for (const chunk of chunkNote(document.documentId, body)) {
    total += 1;
    if (process.argv.includes('--text')) {
      console.log(`${chunk.evidenceId}\t${chunk.section ?? '(body)'}\t${chunk.text.replace(/\s+/g, ' ').slice(0, 110)}`);
    } else {
      console.log(`${chunk.evidenceId}\t${chunk.section ?? '(body)'}`);
    }
  }
}
console.error(`\n${total} chunk(s) across ${manifest.documentCount} document(s)`);
console.error(`boundary=${CHUNKING.boundary} maxChunkChars=${CHUNKING.maxChunkChars}`);
console.error(`corpus version ${manifest.corpusVersion}`);
