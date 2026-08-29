import { z } from 'zod';
import { EvidenceId } from './evidence.js';
import { GroundedText } from './grounded-text.js';

const CardId = z.string().min(1).meta({ id: 'CardId' });

/**
 * "What is X?" — a concise definition plus up to five key points.
 */
export const DefinitionCard = z
  .strictObject({
    id: CardId,
    type: z.literal('definition'),
    title: z.string().min(1),
    definition: GroundedText,
    /**
     * At least one key point. An empty array validated under the previous
     * hand-written schema and rendered as an empty card.
     */
    keyPoints: z.array(GroundedText).min(1).max(5),
  })
  .meta({ id: 'DefinitionCard', title: 'Definition card' });

const ComparisonRow = z
  .strictObject({
    dimension: z.string().min(1),
    /** One value per entity, in the same order as `entities`. */
    values: z.array(GroundedText).min(2).max(4),
  })
  .meta({ id: 'ComparisonRow' });

/**
 * Differences, alternatives, and tradeoffs across two to four entities.
 *
 * The row/entity alignment rule (`values.length === entities.length`) cannot be
 * expressed in JSON Schema and is enforced by the refinement below. Without it,
 * a three-entity table validates with two values per row and renders misaligned.
 */
export const ComparisonCard = z
  .strictObject({
    id: CardId,
    type: z.literal('comparison'),
    title: z.string().min(1),
    entities: z.array(z.string().min(1)).min(2).max(4),
    rows: z.array(ComparisonRow).min(1).max(8),
  })
  .refine((card) => card.rows.every((row) => row.values.length === card.entities.length), {
    message: 'Each comparison row must have exactly one value per entity',
    path: ['rows'],
  })
  .meta({ id: 'ComparisonCard', title: 'Comparison card' });

/**
 * "How does X work?" / "Why does X happen?" — ordered stages or causal steps.
 */
export const MechanismCard = z
  .strictObject({
    id: CardId,
    type: z.literal('mechanism'),
    title: z.string().min(1),
    stages: z
      .array(
        z.strictObject({
          label: z.string().min(1),
          description: GroundedText,
        }),
      )
      .min(2)
      .max(8),
  })
  .meta({ id: 'MechanismCard', title: 'Mechanism card' });

/**
 * Implementation, migration, evaluation, and troubleshooting instructions.
 */
export const ProcedureCard = z
  .strictObject({
    id: CardId,
    type: z.literal('procedure'),
    title: z.string().min(1),
    steps: z
      .array(
        z.strictObject({
          title: z.string().min(1),
          instruction: GroundedText,
        }),
      )
      .min(1)
      .max(10),
  })
  .meta({ id: 'ProcedureCard', title: 'Procedure card' });

/**
 * Source titles, sections, excerpts, and links. Excerpts are rendered from the
 * corpus, not from model output (grounding rule 3).
 */
export const EvidenceCard = z
  .strictObject({
    id: CardId,
    type: z.literal('evidence'),
    title: z.string().min(1),
    evidenceIds: z
      .array(EvidenceId)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'evidenceIds must not contain duplicates',
      })
      .meta({ uniqueItems: true }),
  })
  .meta({ id: 'EvidenceCard', title: 'Evidence card' });

/**
 * The five approved card types. Out of scope for the MVP: any sixth type.
 *
 * This union is the single enumeration of renderable card types. The M3 output
 * gate derives its coverage test from `CARD_TYPES` rather than a hand-written
 * list, so adding a card type without wiring validation and a component fails
 * the build.
 */
export const KnowledgeCard = z
  .discriminatedUnion('type', [
    DefinitionCard,
    ComparisonCard,
    MechanismCard,
    ProcedureCard,
    EvidenceCard,
  ])
  .meta({ id: 'KnowledgeCard', title: 'Knowledge card' });

export type KnowledgeCard = z.infer<typeof KnowledgeCard>;
export type CardType = KnowledgeCard['type'];

/**
 * The renderable card types, derived from the union at runtime.
 *
 * This must never become a hand-written array. A literal list satisfies
 * `readonly CardType[]` even when it is missing a member, so it would go stale
 * silently the moment a sixth type is added — and the coverage test built on it
 * would keep passing while the new type bypassed both validation and the
 * renderer. Deriving from `KnowledgeCard.options` makes that impossible.
 */
export const CARD_TYPES: readonly CardType[] = KnowledgeCard.options.map(
  (option) => option.shape.type.value,
);

export type DefinitionCard = z.infer<typeof DefinitionCard>;
export type ComparisonCard = z.infer<typeof ComparisonCard>;
export type MechanismCard = z.infer<typeof MechanismCard>;
export type ProcedureCard = z.infer<typeof ProcedureCard>;
export type EvidenceCard = z.infer<typeof EvidenceCard>;
