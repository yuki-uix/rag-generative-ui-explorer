import { z } from 'zod';
import { Evidence } from './evidence.js';
import { KnowledgeCard } from './cards.js';
import { SuggestedAction } from './actions.js';

/**
 * Grounding rule 6 covers two distinct situations, and
 * insufficient-evidence detection accuracy is a named success metric, so the
 * response must say which one occurred rather than only that something was
 * wrong.
 *
 * Modelled as a discriminated union so the pairing survives into the generated
 * JSON Schema: an `incomplete: true` response without a reason, or an
 * `incomplete: false` response carrying one, is rejected by both validators.
 */
export const ResponseMetadata = z
  .discriminatedUnion('incomplete', [
    z.strictObject({
      knowledgeBaseVersion: z.string().min(1),
      generatedAt: z.iso.datetime({ offset: true }),
      incomplete: z.literal(false),
    }),
    z.strictObject({
      knowledgeBaseVersion: z.string().min(1),
      generatedAt: z.iso.datetime({ offset: true }),
      incomplete: z.literal(true),
      /** `missing`: the corpus has no answer. `conflicting`: sources disagree. */
      incompleteReason: z.enum(['missing', 'conflicting']),
    }),
  ])
  .meta({ id: 'ResponseMetadata', title: 'Response metadata' });

export type IncompleteReason = 'missing' | 'conflicting';

/**
 * The response envelope. The planner may return zero cards: an empty `cards`
 * array with `incomplete: true` is the correct answer when evidence is
 * insufficient, and is preferable to an invented card.
 */
export const KnowledgeUIResponse = z
  .strictObject({
    query: z.string().min(1),
    cards: z.array(KnowledgeCard).max(4),
    suggestedActions: z.array(SuggestedAction).max(3),
    evidence: z.array(Evidence),
    metadata: ResponseMetadata,
  })
  .superRefine((response, ctx) => {
    const seen = new Set<string>();
    for (const [index, card] of response.cards.entries()) {
      if (seen.has(card.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate card id: ${card.id}`,
          path: ['cards', index, 'id'],
        });
      }
      seen.add(card.id);
    }

    for (const [index, action] of response.suggestedActions.entries()) {
      if (!seen.has(action.payload.cardId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Action references unknown card id: ${action.payload.cardId}`,
          path: ['suggestedActions', index, 'payload', 'cardId'],
        });
      }
    }
  })
  .meta({
    id: 'KnowledgeUIResponse',
    title: 'Knowledge UI response',
    description:
      'Cards, suggested actions, the evidence used, corpus version, and the incomplete flag.',
  });

export type KnowledgeUIResponse = z.infer<typeof KnowledgeUIResponse>;
export type ResponseMetadata = z.infer<typeof ResponseMetadata>;
