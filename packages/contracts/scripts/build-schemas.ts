/**
 * Generates the JSON Schemas under `schemas/` from the Zod contracts.
 *
 * The checked-in JSON Schema files are build artifacts, not sources. Run with
 * `--check` in CI to fail when they drift from the Zod definitions.
 *
 * The generated schemas are a *shape* contract only. Cross-field rules are
 * unrepresentable in JSON Schema and are dropped silently by the generator —
 * see packages/contracts/README.md for the list. Zod is the authoritative gate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Evidence } from '../src/evidence.js';
import { KnowledgeUIResponse } from '../src/response.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '../../../schemas');

const BASE_URI = 'https://example.invalid/schemas';

const targets = [
  { file: 'evidence.schema.json', schema: Evidence },
  { file: 'knowledge-ui-response.schema.json', schema: KnowledgeUIResponse },
] as const;

function generate(file: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  const { $schema, ...rest } = json;
  const withId = {
    $schema,
    $id: `${BASE_URI}/${file}`,
    ...rest,
  };
  return `${JSON.stringify(withId, null, 2)}\n`;
}

const check = process.argv.includes('--check');
let drifted = false;

for (const target of targets) {
  const path = resolve(schemaDir, target.file);
  const generated = generate(target.file, target.schema);

  if (check) {
    let current: string;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      console.error(`missing generated schema: ${target.file}`);
      drifted = true;
      continue;
    }
    if (current !== generated) {
      console.error(
        `${target.file} is out of date. Run \`pnpm schemas:build\` and commit the result.`,
      );
      drifted = true;
    } else {
      console.log(`ok ${target.file}`);
    }
  } else {
    writeFileSync(path, generated, 'utf8');
    console.log(`wrote ${target.file}`);
  }
}

if (check && drifted) {
  process.exit(1);
}
