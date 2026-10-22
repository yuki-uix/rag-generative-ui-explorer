/** Materialise the existing planner schema in Node; the Worker only imports JSON. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plannerSchema } from '@rgux/generation';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../fixtures/planner-schema.json');
const expected = `${JSON.stringify(plannerSchema(resolve(here, '../../..')), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== expected) {
    throw new Error('Planner schema fixture is stale. Run the web planner-schema build script.');
  }
  console.log('planner schema fixture matches the generated contracts');
} else {
  writeFileSync(out, expected, 'utf8');
  console.log('wrote fixtures/planner-schema.json');
}
