/**
 * Validates eval/questions.jsonl against the real chunk set.
 *
 * The acceptance criterion is that every golden identifier resolves to a real
 * evidence identifier, checked by script rather than by review — a well-formed
 * identifier resolving to nothing would pass every shape check while silently
 * dropping its question from the recall denominator.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../src/manifest.js';
import { parseNote } from '../src/note.js';
import { chunkNote } from '../src/chunks.js';
import { parseEvalSet, resolveGoldenEvidence, uncoveredSections } from '../src/eval-set.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const { manifest, errors } = buildManifest(resolve(repoRoot, 'knowledge'));
if (errors.length > 0) {
  for (const error of errors) console.error(`invalid note  ${error.message}`);
  process.exit(1);
}

const chunkIds = manifest.documents.flatMap((document) =>
  chunkNote(
    document.documentId,
    parseNote(document.path, readFileSync(resolve(repoRoot, document.path), 'utf8')).body,
  ).map((chunk) => chunk.evidenceId),
);

const { set, problems } = parseEvalSet(
  readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8'),
);

for (const problem of problems) console.error(`${problem.where}: ${problem.message}`);
if (set === undefined || problems.length > 0) process.exit(1);

const report = resolveGoldenEvidence(set, chunkIds, manifest.corpusVersion);

for (const miss of report.unresolved) {
  console.error(`unresolved   ${miss.questionId} -> ${miss.evidenceId}`);
}
if (report.corpusMismatch) {
  console.error(
    `corpus mismatch: labelled against ${report.corpusMismatch.labelled}, corpus is now ${report.corpusMismatch.actual}. Re-check the labels, then update the header.`,
  );
}

const byDomain = new Map<string, number>();
for (const question of set.questions) {
  byDomain.set(question.domain, (byDomain.get(question.domain) ?? 0) + 1);
}
const insufficient = set.questions.filter((q) => q.expectInsufficient).length;
const goldenCount = set.questions.reduce((n, q) => n + q.goldenEvidenceIds.length, 0);

console.log(`${set.questions.length} question(s), ${goldenCount} golden evidence reference(s)`);
for (const [domain, count] of [...byDomain].sort()) console.log(`  ${domain.padEnd(15)} ${count}`);
console.log(`  ${'unanswerable'.padEnd(15)} ${insufficient}`);
console.log(`labelled against ${set.header.corpusVersion} by ${set.header.labelledBy}`);

if (report.untouchedDocuments.length > 0) {
  console.log(`\n${report.untouchedDocuments.length} note(s) no question draws on:`);
  for (const doc of report.untouchedDocuments) console.log(`  ${doc}`);
}

if (report.unresolved.length > 0 || report.corpusMismatch) process.exit(1);

const coverage = uncoveredSections(set, chunkIds);
if (coverage.unexplained.length > 0) {
  console.error(`\n${coverage.unexplained.length} section(s) no question measures, with no reason recorded:`);
  for (const entry of coverage.unexplained) {
    console.error(`  ${entry.documentId}  §${entry.section}`);
  }
  console.error(
    '\nEither label a question against the section, or record why it needs no\n' +
      'golden evidence in UNMEASURED_SECTIONS. A silence here is how a note\'s\n' +
      'central argument went unmeasured while the note-level check stayed green.',
  );
  process.exit(1);
}
if (coverage.staleExemptions.length > 0) {
  console.error(
    `\n${coverage.staleExemptions.length} exemption(s) name a section that is measured after all:`,
  );
  for (const slug of coverage.staleExemptions) console.error(`  ${slug}`);
  console.error('\nRemove them. An exemption nobody needs is a standing permission.');
  process.exit(1);
}
console.log(`\n${coverage.unmeasured.length} section(s) deliberately unmeasured, all with a recorded reason`);
