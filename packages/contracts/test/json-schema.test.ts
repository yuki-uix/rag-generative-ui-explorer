/**
 * The JSON Schemas under `schemas/` are generated artifacts. These tests check
 * two things: that the checked-in files match the Zod contracts, and that the
 * shape gates required by MVP issue #1 survive generation.
 *
 * They also pin the known weakness: cross-field rules are dropped silently by
 * the generator, so JSON Schema validation is not equivalent to Zod validation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadFixtures, ZOD_ONLY_FIXTURES } from './fixtures.js';
import { ACTION_KINDS, CARD_TYPES } from '../src/index.js';

const schemaDir = resolve(import.meta.dirname, '../../../schemas');
const responseSchema = JSON.parse(
  readFileSync(resolve(schemaDir, 'knowledge-ui-response.schema.json'), 'utf8'),
);
const evidenceSchema = JSON.parse(readFileSync(resolve(schemaDir, 'evidence.schema.json'), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validateResponse = ajv.compile(responseSchema);

describe('generated JSON Schema', () => {
  it('compiles', () => {
    expect(typeof validateResponse).toBe('function');
    expect(() => new Ajv2020({ strict: false }).compile(evidenceSchema)).not.toThrow();
  });

  it.each(loadFixtures('valid'))('accepts %s', (_name, fixture) => {
    expect(validateResponse(fixture), JSON.stringify(validateResponse.errors)).toBe(true);
  });

  it.each(loadFixtures('invalid').filter(([name]) => !ZOD_ONLY_FIXTURES.has(name)))(
    'rejects %s',
    (_name, fixture) => {
      expect(validateResponse(fixture)).toBe(false);
    },
  );

  it.each([...ZOD_ONLY_FIXTURES])(
    'does not catch %s — a documented cross-field gap, enforced by Zod only',
    (name) => {
      const fixture = Object.fromEntries(loadFixtures('invalid'))[name];
      expect(fixture).toBeDefined();
      expect(validateResponse(fixture)).toBe(true);
    },
  );
});

describe('shape gates required by the MVP grounding rules', () => {
  const defs = responseSchema.$defs;

  it('requires a reason on incomplete responses', () => {
    const branches = defs.ResponseMetadata.oneOf;
    const incompleteBranch = branches.find(
      (branch: { properties: { incomplete: { const: boolean } } }) =>
        branch.properties.incomplete.const === true,
    );
    expect(incompleteBranch.required).toContain('incompleteReason');
    expect(incompleteBranch.properties.incompleteReason.enum).toEqual(['missing', 'conflicting']);
  });

  it('forbids empty key point and comparison row arrays', () => {
    expect(defs.DefinitionCard.properties.keyPoints.minItems).toBe(1);
    expect(defs.ComparisonCard.properties.rows.minItems).toBe(1);
  });

  it('requires at least one unique evidence ID on every grounded field', () => {
    expect(defs.GroundedText.properties.evidenceIds.minItems).toBe(1);
    expect(defs.GroundedText.properties.evidenceIds.uniqueItems).toBe(true);
    expect(defs.GroundedText.required).toContain('evidenceIds');
  });

  const deref = (node: { $ref?: string }) =>
    node.$ref ? defs[node.$ref.replace('#/$defs/', '')] : node;

  it('constrains action payloads per action kind', () => {
    const branches = defs.SuggestedAction.oneOf.map(deref);
    expect(branches).toHaveLength(ACTION_KINDS.length);

    for (const branch of branches) {
      expect(branch.properties.payload.additionalProperties).toBe(false);
      expect(branch.properties.payload.required).toContain('cardId');
    }
  });

  it('emits one branch per approved card type and no others', () => {
    const emitted = defs.KnowledgeCard.oneOf
      .map(deref)
      .map((branch: { properties: { type: { const: string } } }) => branch.properties.type.const)
      .sort();
    expect(emitted).toEqual([...CARD_TYPES].sort());
  });
});
