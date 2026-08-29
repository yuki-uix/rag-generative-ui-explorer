import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const created: string[] = [];

export function cleanUpCorpora(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export const DEFAULT_SOURCE = {
  sourceType: 'paper',
  title: 'Dense Passage Retrieval for Open-Domain Question Answering',
  url: 'https://arxiv.org/abs/2004.04906',
  author: 'Vladimir Karpukhin et al.',
  published: '2020-04-10',
  retrieved: '2026-08-28',
  license: 'arXiv non-exclusive licence; short quotations only',
  primary: true,
};

export const DEFAULT_NOTE = {
  title: 'Dense retrieval',
  domain: 'rag',
  tags: ['retrieval-strategies'],
  summary: 'How a dual-encoder retriever matches meaning rather than words.',
  author: 'yuki-uix',
  revised: '2026-08-28',
  sources: [DEFAULT_SOURCE],
};

export interface NoteSpec {
  path: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  raw?: string;
}

function toYaml(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const lines = Object.entries(item as Record<string, unknown>).map(
            ([key, inner], index) =>
              `${indent}${index === 0 ? '- ' : '  '}${key}: ${JSON.stringify(inner)}`,
          );
          return lines.join('\n');
        }
        return `${indent}- ${JSON.stringify(item)}`;
      })
      .join('\n');
  }
  return JSON.stringify(value);
}

function frontmatterBlock(frontmatter: Record<string, unknown>): string {
  return Object.entries(frontmatter)
    .map(([key, value]) =>
      Array.isArray(value)
        ? value.length === 0
          ? `${key}: []`
          : `${key}:\n${toYaml(value, '  ')}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join('\n');
}

/** Writes a throwaway knowledge directory and returns its path. */
export function corpus(notes: NoteSpec[]): string {
  const root = mkdtempSync(join(tmpdir(), 'rgux-corpus-'));
  created.push(root);

  for (const note of notes) {
    const full = join(root, note.path);
    mkdirSync(join(full, '..'), { recursive: true });

    if (note.raw !== undefined) {
      writeFileSync(full, note.raw, 'utf8');
      continue;
    }

    const frontmatter = { ...DEFAULT_NOTE, ...note.frontmatter };
    const body = note.body ?? 'Body prose.';
    writeFileSync(
      full,
      ['---', frontmatterBlock(frontmatter), '---', '', `# ${frontmatter.title}`, '', body].join(
        '\n',
      ),
      'utf8',
    );
  }

  return root;
}
