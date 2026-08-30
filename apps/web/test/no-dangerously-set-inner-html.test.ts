/**
 * The one opt-out that would turn excerpt text back into parsed markup.
 *
 * React renders string children as text nodes: they are inserted as text and
 * never passed through the HTML parser, so a `<script>` in an excerpt cannot
 * become an element. The only way to make a string into markup is
 * `dangerouslySetInnerHTML`, which bypasses that path. This check bans that
 * prop across every component, so the next person who reaches for it to render
 * Markdown emphasis in an excerpt hits this instead of silently reopening the
 * hole.
 *
 * The file list is derived from the components directory, not written out, so a
 * component added later is covered without anyone remembering to list it.
 *
 * The pattern matches the prop being assigned (`dangerouslySetInnerHTML=`),
 * not a bare mention of the name. A comment explaining why the prop is banned
 * must not trip the very gate that bans it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = resolve(import.meta.dirname, '../components');

/** The prop as it appears in JSX — `dangerouslySetInnerHTML={{ __html: ... }}`. */
const USAGE = /dangerouslySetInnerHTML\s*=/;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('excerpt rendering stays text-only', () => {
  it('no component under apps/web/components/ uses dangerouslySetInnerHTML', () => {
    const offenders = listSourceFiles(componentsDir).filter((file) =>
      USAGE.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
