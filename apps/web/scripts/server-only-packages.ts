/**
 * The declaration the bundle gate is built from, in a module of its own.
 *
 * It lives apart from `check-bundle.ts` because that script runs the check at
 * module scope and calls `process.exit`. Importing the list from there would
 * run the whole check as a side effect of reading a constant — and with no
 * `dist/` present it would exit mid-import, which vitest reports as a suite
 * that failed with *no tests*, the shape that hides a lost test rather than
 * announcing one.
 */
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
export const SERVER_ONLY = [
  {
    package: '@rgux/corpus',
    /** Where the markers are copied from, so a test can check they still exist. */
    sourceDir: 'packages/corpus/src',
    markers: [
      // `CHUNKING.boundary` in chunks.ts.
      'h2-section',
      // Error thrown by parseNote in note.ts when the frontmatter block is absent.
      'missing YAML frontmatter block',
      // Error thrown by checkTitleMatchesHeading in manifest.ts.
      'note body has no top-level heading',
      // Heading parsed by parseScopeTopics in scope.ts. Added after a review
      // found that module reaching the client bundle with `readFileSync` while
      // the gate reported clean: it touches the filesystem and no marker
      // covered it. `test/bundle-markers.test.ts` now fails when any
      // filesystem-touching module is left uncovered, so the next one cannot be
      // missed the same way.
      '## Intersection topics',
    ],
  },
] as const;
