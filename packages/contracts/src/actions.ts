import { z } from 'zod';

/**
 * Suggested actions are the only model-authored values that flow back into the
 * server as request input. The previous hand-written schema left `payload` as a
 * free-form object, which made it the one unconstrained channel from model
 * output into the application. Each action now carries its own payload shape.
 */

const ActionId = z.string().min(1);
const ActionLabel = z.string().min(1);
const CardRef = z.string().min(1);

/** Local: expands evidence already present in the response. Never calls the model. */
export const ShowSourcesAction = z
  .strictObject({
    id: ActionId,
    label: ActionLabel,
    action: z.literal('show_sources'),
    payload: z.strictObject({ cardId: CardRef }),
  })
  .meta({ id: 'ShowSourcesAction' });

/** Agent: runs a narrower retrieval scoped to a card and appends new cards. */
export const ExplainFurtherAction = z
  .strictObject({
    id: ActionId,
    label: ActionLabel,
    action: z.literal('explain_further'),
    payload: z.strictObject({
      cardId: CardRef,
      /** Optional narrowing hint derived from the card, not the raw query. */
      focus: z.string().min(1).max(200).optional(),
    }),
  })
  .meta({ id: 'ExplainFurtherAction' });

/** Agent: retrieves a new entity and extends or replaces a comparison card. */
export const AddToComparisonAction = z
  .strictObject({
    id: ActionId,
    label: ActionLabel,
    action: z.literal('add_to_comparison'),
    payload: z.strictObject({
      cardId: CardRef,
      entity: z.string().min(1).max(120),
    }),
  })
  .meta({ id: 'AddToComparisonAction' });

export const SuggestedAction = z
  .discriminatedUnion('action', [
    ShowSourcesAction,
    ExplainFurtherAction,
    AddToComparisonAction,
  ])
  .meta({ id: 'SuggestedAction', title: 'Suggested action' });

export type SuggestedAction = z.infer<typeof SuggestedAction>;
export type ActionKind = SuggestedAction['action'];

/** Derived from the union at runtime, for the same reason as `CARD_TYPES`. */
export const ACTION_KINDS: readonly ActionKind[] = SuggestedAction.options.map(
  (option) => option.shape.action.value,
);
