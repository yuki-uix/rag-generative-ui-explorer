import { z } from 'zod';
import { EVIDENCE_ID_PATTERN } from './evidence-id.js';

/**
 * An evidence ID references a chunk produced by ingestion. The shape is checked
 * here; whether the ID exists in the current generation's retrieval set is a
 * separate, mandatory check performed by the validation pipeline.
 */
export const EvidenceId = z
  .string()
  .min(1)
  .regex(EVIDENCE_ID_PATTERN, 'Evidence ID must match {documentId}#{section}#{index}-{hash}')
  .meta({ id: 'EvidenceId', description: 'Stable, addressable identifier for a corpus chunk.' });

export const EvidenceMetadata = z
  .strictObject({
    author: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
  })
  .meta({ id: 'EvidenceMetadata' });

/**
 * An immutable, addressable excerpt produced by ingestion and retrieval.
 * Evidence carries source metadata and scores but no presentation instructions.
 */
export const Evidence = z
  .strictObject({
    id: EvidenceId,
    documentId: z.string().min(1),
    documentTitle: z.string().min(1),
    section: z.string().min(1).optional(),
    /** Verbatim corpus text. Never a model rewrite — see grounding rule 3. */
    text: z.string().min(1),
    url: z.url().optional(),
    updatedAt: z.iso.datetime().optional(),
    retrievalScore: z.number(),
    rerankScore: z.number().optional(),
    metadata: EvidenceMetadata,
  })
  .meta({
    id: 'Evidence',
    title: 'Evidence',
    description: 'An immutable, addressable corpus excerpt with source metadata and scores.',
  });

export type Evidence = z.infer<typeof Evidence>;
export type EvidenceMetadata = z.infer<typeof EvidenceMetadata>;
