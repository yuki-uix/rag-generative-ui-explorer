/**
 * Gate: server-only packages must not reach the built app bundles (#54).
 *
 * The corpus reader reads `knowledge/` with `node:fs`. That is fine at build
 * time, where `scripts/generate-evidence.ts` runs in Node and cuts the cited
 * passages into `fixtures/evidence.json`, but it is not fine in either bundle:
 * the browser has no filesystem at all, and workerd's `node:fs` is an empty
 * virtual filesystem, so a page calling `ingest` at render time fails with
 * `readdir '/knowledge'` under both dev and prod. A client component that
 * imports `ingest` from `@rgux/corpus` ships the reader silently — the build
 * exits 0 and no warning fires — so this gate reads the built output and fails
 * when a server-only package's code is actually in it.
 *
 * It reads the built bundles, not the import graph in source, so a transitive
 * import is caught the same as a direct one: whatever the bundler resolved and
 * wrote to `dist/client` and `dist/server` is what is scanned.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_ONLY } from './server-only-packages.js';

const here = dirname(fileURLToPath(import.meta.url));


/** Both bundles run without a real filesystem, so both are scanned. */
const BUNDLE_DIRS = ['client', 'server'] as const;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const missing = BUNDLE_DIRS.filter(
  (name) => !existsSync(resolve(here, '../dist', name)),
);
if (missing.length > 0) {
  console.error(
    `No build output for ${missing.join(', ')} under apps/web/dist — run web:build first.`,
  );
  process.exit(1);
}

const failures: string[] = [];
let fileCount = 0;

for (const name of BUNDLE_DIRS) {
  const files = listFiles(resolve(here, '../dist', name));
  if (files.length === 0) {
    console.error(`No files under apps/web/dist/${name} — run web:build first.`);
    process.exit(1);
  }
  fileCount += files.length;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { package: pkg, markers } of SERVER_ONLY) {
      for (const marker of markers) {
        if (source.includes(marker)) {
          failures.push(`${marker} (${pkg}) in ${file}`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Server-only package code reached a built bundle:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `Checked ${fileCount} files under dist/client and dist/server; no server-only package markers.`,
);
