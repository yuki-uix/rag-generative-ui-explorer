import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { CARD_TYPES, type Evidence } from '@rgux/contracts';
import {
  PLANNER_PROMPT_VERSION,
  plannerSystemPrompt,
  plannerUserPrompt,
  schemaBelongsInPrompt,
} from './prompt.js';
import type { ModelProfile } from '../profile.js';
import { requestExtras } from '../generate.js';

/**
 * The generated JSON Schema, read from the build artifact rather than rebuilt.
 *
 * #23 asks for structured output requested against *the generated schema*, not
 * a second description of it. `schemas:check` keeps the file honest against the
 * Zod contracts, so this is the same shape the validator will enforce — one
 * source, two consumers.
 */
export function responseSchema(repoRoot: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'schemas/knowledge-ui-response.schema.json'), 'utf8'),
  ) as Record<string, unknown>;
}

/**
 * The slice of the generated schema the planner is asked for: cards, and
 * whether the answer is incomplete. Nothing else.
 *
 * The first attempt handed over the whole `KnowledgeUIResponse` schema, and the
 * model filled the entire envelope — inventing `evidenceUsed` entries complete
 * with plausible URLs, timestamps, and retrieval scores, because the schema had
 * fields for them. Grounding rule 3 says evidence comes from the corpus, never
 * from model output; a schema that asks the model for evidence records asks it
 * to break that rule, and it obliged.
 *
 * The envelope is assembled server-side from the retrieval set that was
 * actually used. Slicing rather than hand-writing keeps one source: a card type
 * added to the contract appears here without anyone editing this file.
 */
export function plannerSchema(repoRoot: string): Record<string, unknown> {
  const full = responseSchema(repoRoot);
  const defs = full['$defs'] as Record<string, Record<string, unknown>>;
  const root = defs['KnowledgeUIResponse']!;
  const properties = root['properties'] as Record<string, unknown>;

  const cards = properties['cards'];
  if (cards === undefined) {
    throw new Error('The generated response schema has no `cards` property; the slice is stale.');
  }

  // Only the definitions the cards actually reach. An unused `$def` would be
  // harmless but it is also the schema's weight, and the weight is what
  // exhausted the token budget on the first run.
  const wanted = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$ref' && typeof value === 'string') {
        const name = value.replace('#/$defs/', '');
        if (!wanted.has(name)) {
          wanted.add(name);
          walk(defs[name]);
        }
      } else {
        walk(value);
      }
    }
  };
  walk(cards);

  const sliced = {
    $schema: full['$schema'],
    type: 'object',
    properties: {
      cards,
      incomplete: { type: 'boolean' },
      incompleteReason: { enum: ['missing', 'conflicting'] },
    },
    required: ['cards', 'incomplete'],
    additionalProperties: false,
    $defs: Object.fromEntries([...wanted].map((name) => [name, defs[name]])),
  };

  // A `cards` property that exists but describes nothing slices cleanly into a
  // schema that constrains nothing — measured: a 260-byte result carrying none
  // of the card types, handed to a planner as though it were the contract. The
  // presence check above does not catch it, so the slice is checked for what it
  // is supposed to contain rather than for the shape it was cut from.
  const serialised = JSON.stringify(sliced);
  const missing = CARD_TYPES.filter((type) => !serialised.includes(`"${type}"`));
  if (missing.length > 0) {
    throw new Error(
      `The sliced planner schema is missing card type(s): ${missing.join(', ')}. ` +
        'The generated schema changed shape and the slice no longer reaches the cards.',
    );
  }

  return sliced;
}

export interface PlanRecord {
  readonly profileId: string;
  readonly model: string;
  readonly promptVersion: string;
  /**
   * Whether the endpoint enforces the schema this request carried.
   *
   * Recorded per plan because it changes what a downstream validity rate means:
   * where the schema is unenforced, an invalid spec measures the model's
   * compliance; where it is enforced, it measures almost nothing.
   */
  readonly schemaEnforced: boolean;
  /** Raw completion, before any parsing. "Valid without repair" needs it (#25). */
  readonly raw: string;
  readonly stopReason: string | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheCreationInputTokens: number;
    readonly cacheReadInputTokens: number;
  };
  readonly latencyMs: number;
}

export interface PlanOptions {
  profile: ModelProfile;
  question: string;
  evidence: readonly Evidence[];
  /** The generated schema, so this module does not decide where the repo is. */
  schema: unknown;
  apiKey?: string;
  maxTokens?: number;
}

/**
 * Ask the planner for a card set.
 *
 * Returns the raw completion and the record. **It does not validate**: that is
 * #24, and keeping it out of here is deliberate. A planner that parsed and
 * repaired its own output would make "valid without a second model call" —
 * an exit criterion — uncomputable, because the number would be measured after
 * the repair it is supposed to detect.
 */
export async function planCards(options: PlanOptions): Promise<PlanRecord> {
  const { profile, question, evidence, schema, maxTokens = 4096 } = options;

  const apiKey = options.apiKey ?? process.env[profile.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${profile.apiKeyEnv} is not set; profile ${profile.id} cannot run.`);
  }

  const client = new Anthropic({ apiKey, baseURL: profile.baseURL });

  // The schema is sent where the profile declares it is enforced, and omitted
  // where it is not. Sending it anyway would be harmless on the wire and
  // dishonest in the record: it would look like a constrained request while the
  // endpoint drops the field, which is measured behaviour on DeepSeek.
  const structured = profile.enforcesOutputSchema
    ? { output_config: { format: { type: 'json_schema', schema } } }
    : {};

  const startedAt = Date.now();
  const stream = client.messages.stream({
    model: profile.model,
    max_tokens: maxTokens,
    system: plannerSystemPrompt(schemaBelongsInPrompt(profile) ? schema : undefined),
    messages: [{ role: 'user', content: plannerUserPrompt(question, evidence) }],
    ...requestExtras(profile),
    ...structured,
  } as never);

  const message = await stream.finalMessage();

  return {
    profileId: profile.id,
    model: message.model,
    promptVersion: PLANNER_PROMPT_VERSION,
    schemaEnforced: profile.enforcesOutputSchema,
    raw: message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join(''),
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs: Date.now() - startedAt,
  };
}
