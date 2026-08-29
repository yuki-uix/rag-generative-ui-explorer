import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { NoteFrontmatter } from './frontmatter.js';

const FRONTMATTER_DELIMITER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface ParsedNote {
  frontmatter: NoteFrontmatter;
  body: string;
}

export class NoteError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'NoteError';
  }
}

export function parseNote(path: string, source: string): ParsedNote {
  const match = FRONTMATTER_DELIMITER.exec(source);
  if (!match) {
    throw new NoteError(path, 'missing YAML frontmatter block');
  }

  let raw: unknown;
  try {
    raw = parseYaml(match[1]!);
  } catch (error) {
    throw new NoteError(path, `frontmatter is not valid YAML: ${(error as Error).message}`);
  }

  const result = NoteFrontmatter.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new NoteError(path, details);
  }

  const body = source.slice(match[0].length).trim();
  if (body === '') {
    throw new NoteError(path, 'note body is empty');
  }

  return { frontmatter: result.data, body };
}

export function readNote(path: string): ParsedNote {
  return parseNote(path, readFileSync(path, 'utf8'));
}
