/**
 * Asserts that every workspace package is reachable by `pnpm -r typecheck` and
 * `pnpm -r test`.
 *
 * This exists because neither recursive nor filtered invocation fails when a
 * script is missing: with `test` deleted from a package, `pnpm -r test` still
 * prints "Scope: 3 of 4" and exits 0, and `pnpm --filter <pkg> test` exits 0
 * too. Scope counts the packages the filter selected, not the ones that ran
 * anything. So a package can silently stop being tested while CI stays green —
 * which is the failure #50 exists to prevent.
 *
 * The package list is derived from pnpm-workspace.yaml rather than written out
 * here, so a package added later is covered automatically instead of needing
 * someone to remember this file.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = ['typecheck', 'test'];

const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
const globs = workspace
  .split(/^packages:\s*$/m)[1]
  ?.split(/^\S/m)[0]
  .split('\n')
  .map((line) => line.match(/^\s+-\s+(.+?)\s*$/)?.[1])
  .filter(Boolean);

if (!globs?.length) {
  console.error('No `packages:` entries found in pnpm-workspace.yaml.');
  process.exit(1);
}

const packages = globs.flatMap((glob) => {
  if (!glob.endsWith('/*')) return existsSync(join(root, glob, 'package.json')) ? [glob] : [];
  const parent = glob.slice(0, -2);
  return readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json')))
    .map((entry) => `${parent}/${entry.name}`);
});

const failures = [];
for (const dir of packages) {
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  const missing = REQUIRED.filter((script) => !manifest.scripts?.[script]);
  if (missing.length) failures.push(`${dir} (${manifest.name}) is missing: ${missing.join(', ')}`);
}

if (failures.length) {
  console.error('Workspace packages not covered by the recursive runs:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`All ${packages.length} workspace package(s) declare ${REQUIRED.join(' and ')}.`);
