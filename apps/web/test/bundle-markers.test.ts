/**
 * Keeps the bundle gate's markers from going stale.
 *
 * `scripts/check-bundle.ts` looks for string literals copied out of a
 * server-only package. Nothing in the build tells it when one of those strings
 * is edited at its source: the marker simply stops matching, the gate keeps
 * exiting 0, and the surface it guards quietly stops being guarded. That is the
 * failure this project keeps meeting — a check that passes because it is looking
 * for something that is no longer there.
 *
 * The list is imported from the script rather than repeated here, so a marker
 * added later is covered without anyone remembering this file.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVER_ONLY } from '../scripts/server-only-packages.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function readAll(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? readAll(path) : readFileSync(path, 'utf8');
    })
    .join('\n');
}

describe('the bundle gate markers', () => {
  it('are not empty, so the gate cannot pass by having nothing to look for', () => {
    expect(SERVER_ONLY.length).toBeGreaterThan(0);
    for (const entry of SERVER_ONLY) {
      expect(entry.markers.length, entry.package).toBeGreaterThan(0);
    }
  });

  /**
   * Coverage as a test rather than a checklist.
   *
   * The markers were hand-picked, and a review found `scope.ts` reaching the
   * client bundle with `readFileSync` while the gate reported clean — it touches
   * the filesystem and no marker happened to cover it. Remembering to add one is
   * the step that failed, so the requirement is derived from the source tree
   * instead.
   *
   * Coverage is transitive, because bundling is. `ingest.ts` touches the
   * filesystem and has no distinctive runtime literal of its own, but it cannot
   * reach a bundle without dragging in `manifest.ts`, `note.ts`, and `chunks.ts`,
   * whose markers do fire. Requiring a marker per module instead would force a
   * fake one: the only quotable strings left in `ingest.ts` are comments, and a
   * comment is stripped during bundling — checked, not assumed, by building with
   * `ingest` called from a client component and finding zero hits for it against
   * two for `h2-section`. A marker that never appears in the output satisfies a
   * coverage rule while measuring nothing, which is the failure this test exists
   * to prevent, not to commit.
   */
  it('cover every filesystem-touching module of each server-only package', () => {
    const FS = /\bnode:fs\b|\breadFileSync\b|\breaddirSync\b|\bwriteFileSync\b/;
    const RELATIVE_IMPORT = /from '\.\/([\w-]+)\.js'/g;

    const uncovered = SERVER_ONLY.flatMap((entry) => {
      const dir = resolve(repoRoot, entry.sourceDir);
      const modules = new Map(
        readdirSync(dir, { withFileTypes: true })
          .filter((file) => file.isFile() && file.name.endsWith('.ts'))
          .map((file) => [file.name.replace(/\.ts$/, ''), readFileSync(join(dir, file.name), 'utf8')]),
      );

      const hasMarker = (name: string) => {
        const source = modules.get(name);
        return source !== undefined && entry.markers.some((marker) => source.includes(marker));
      };

      /** Covered if it carries a marker, or if anything it imports is covered. */
      const covered = (name: string, seen = new Set<string>()): boolean => {
        if (seen.has(name)) return false;
        seen.add(name);
        if (hasMarker(name)) return true;
        const source = modules.get(name) ?? '';
        return [...source.matchAll(RELATIVE_IMPORT)].some(([, imported]) =>
          covered(imported, seen),
        );
      };

      return [...modules]
        .filter(([, source]) => FS.test(source))
        .filter(([name]) => !covered(name))
        .map(
          ([name]) =>
            `${entry.package}: ${name}.ts touches the filesystem and neither it nor anything it imports carries a marker`,
        );
    });

    expect(uncovered).toEqual([]);
  });

  it('still appear verbatim in the source they were copied from', () => {
    const stale = SERVER_ONLY.flatMap((entry) => {
      const source = readAll(resolve(repoRoot, entry.sourceDir));
      return entry.markers
        .filter((marker) => !source.includes(marker))
        .map((marker) => `${entry.package}: "${marker}" is no longer in ${entry.sourceDir}`);
    });

    expect(stale).toEqual([]);
  });
});
