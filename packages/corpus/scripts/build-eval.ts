/**
 * Generates eval/questions.jsonl from eval/questions.ts, resolving each
 * structural golden-evidence reference to the evidence identifier the real
 * chunker produces.
 *
 * Without `--write`, the generated file is compared rather than rewritten, so
 * CI fails when the corpus or the labels change without the artefact being
 * regenerated. A stale artefact is the dangerous case: it would resolve
 * cleanly against yesterday's chunk set and silently mismeasure recall.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { parseNote } from '../src/note.js';
import { chunkNote, CHUNKING } from '../src/chunks.js';
import { QUESTIONS, LABELLED_BY, LABELLED_ON } from '../../../eval/questions.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const target = resolve(repoRoot, 'eval/questions.jsonl');

const { manifest, errors } = buildManifest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  for (const error of errors) console.error(`invalid note  ${error.message}`);
  process.exit(1);
}

/** documentId -> "section#index" -> evidenceId, from the real chunker. */
const index = new Map<string, Map<string, string>>();
for (const document of manifest.documents) {
  const body = parseNote(
    document.path,
    readFileSync(resolve(repoRoot, document.path), 'utf8'),
  ).body;
  const perDocument = new Map<string, string>();
  for (const chunk of chunkNote(document.documentId, body)) {
    perDocument.set(`${chunk.evidenceId.split('#')[1]}#${chunk.chunkIndex}`, chunk.evidenceId);
  }
  index.set(document.documentId, perDocument);
}

const unresolved: string[] = [];
const records = QUESTIONS.map((question) => {
  const goldenEvidenceIds = question.goldenEvidence.map((ref) => {
    const key = `${ref.section}#${ref.chunkIndex ?? 0}`;
    const evidenceId = index.get(ref.documentId)?.get(key);
    if (evidenceId === undefined) {
      unresolved.push(`${question.id}: ${ref.documentId} has no chunk ${key}`);
      return `UNRESOLVED:${ref.documentId}#${key}`;
    }
    return evidenceId;
  });

  return {
    id: question.id,
    question: question.question,
    domain: question.domain,
    expectedCardTypes: question.expectedCardTypes,
    goldenEvidenceIds,
    expectInsufficient: question.expectInsufficient,
  };
});

if (unresolved.length > 0) {
  for (const problem of unresolved) console.error(`unresolved   ${problem}`);
  console.error(`\n${unresolved.length} golden reference(s) name a chunk that does not exist.`);
  process.exit(1);
}

const header = {
  _header: {
    corpusVersion: manifest.corpusVersion,
    chunking: { boundary: CHUNKING.boundary, maxChunkChars: CHUNKING.maxChunkChars },
    questionCount: records.length,
    labelledBy: LABELLED_BY,
    labelledOn: LABELLED_ON,
  },
};

const serialised =
  [header, ...records].map((record) => JSON.stringify(record)).join('\n') + '\n';

if (process.argv.includes('--write')) {
  writeFileSync(target, serialised, 'utf8');
  console.log(`wrote eval/questions.jsonl (${records.length} questions)`);
} else {
  let current: string | undefined;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    console.error('eval/questions.jsonl is missing. Run `pnpm eval:build`.');
    process.exit(1);
  }
  if (current !== serialised) {
    console.error('eval/questions.jsonl is out of date. Run `pnpm eval:build` and commit it.');
    process.exit(1);
  }
  console.log('ok eval/questions.jsonl');
}
