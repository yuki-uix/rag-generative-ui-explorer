import { z } from 'zod';
import { EvidenceId } from './evidence.js';

/**
 * Grounding rule 4: generated content is labelled so the renderer can present
 * inferred claims differently from extracted ones (grounding rule 5).
 */
export const GroundingMode = z
  .enum(['extractive', 'summarized', 'inferred'])
  .meta({ id: 'GroundingMode' });

const uniqueEvidenceIds = z
  .array(EvidenceId)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'evidenceIds must not contain duplicates',
  })
  .meta({ uniqueItems: true });

/**
 * Every factual field in a card is a GroundedText. Grounding rule 1 requires at
 * least one evidence ID, including for `inferred` content (grounding rule 5).
 */
export const GroundedText = z
  .strictObject({
    text: z.string().min(1),
    mode: GroundingMode,
    evidenceIds: uniqueEvidenceIds,
  })
  .meta({
    id: 'GroundedText',
    title: 'Grounded text',
    description: 'A factual field carrying its grounding mode and supporting evidence IDs.',
  });

export type GroundedText = z.infer<typeof GroundedText>;
export type GroundingMode = z.infer<typeof GroundingMode>;
