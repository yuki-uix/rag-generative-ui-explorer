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

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Server-only packages and the strings that expose them in a bundle.
 *
 * Each marker is a runtime string literal copied verbatim from that package's
 * source. It survives bundling for a specific reason: minification renames
 * identifiers (so a function like `buildManifest` is gone from the output) but
 * never rewrites the contents of a string literal, so `h2-section` is still
 * there. That is the property the check relies on.
 *
 * The markers are deliberately NOT the package name or a `node:fs` specifier:
 * the bundler strips both, so a grep for either reports clean while the reader
 * is in the bundle — the exact false pass this gate exists to close. They are
 * package-specific phrases spread across the modules `ingest` pulls in
 * (`chunks.ts`, `note.ts`, `manifest.ts`), so tree-shaking one subgraph does
 * not blind the check.
 *
 * A second server-only package is one entry here, not a new check.
 */
const SERVER_ONLY = [
  {
    package: '@rgux/corpus',
    markers: [
      // `CHUNKING.boundary` in chunks.ts.
      'h2-section',
      // Error thrown by parseNote in note.ts when the frontmatter block is absent.
      'missing YAML frontmatter block',
      // Error thrown by checkTitleMatchesHeading in manifest.ts.
      'note body has no top-level heading',
    ],
  },
] as const;

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
