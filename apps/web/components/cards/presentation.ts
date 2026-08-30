import type { KnowledgeCard } from '@rgux/contracts';

/**
 * Which presentation a card gets.
 *
 * This is a pure function of the card's own shape. The model supplies a card;
 * it never names a presentation. That is the property #18 requires and the one
 * that keeps alternate renderings free: a renderer decision costs a component,
 * whereas letting the model choose would add a degree of freedom and a
 * validation surface, which is #35's question and not this one's.
 *
 * The rule is about whether a flow can be *read*, not about whether the data is
 * a sequence. Every mechanism and procedure is a sequence; only some of them
 * have nodes short enough to scan side by side. A flow whose nodes hold full
 * sentences is a table of paragraphs — it reorganises the prose without making
 * it faster to read, which is the failure mode the comparison card already has
 * when its cells are long.
 */
/**
 * **These two numbers are unmeasured defaults, not findings.** Nothing in the
 * corpus supports them and no reader has been timed against them; they encode a
 * guess that a chain of more than six nodes, or nodes whose labels wrap, reads
 * worse than a list.
 *
 * They are written here as named constants rather than inline so the guess is
 * visible and cheap to revise. What would settle them is M4's time-to-locate-a-
 * fact measurement (#34), which is the only place this project will learn
 * whether a flow helps a reader at all — and if it does not, the right change is
 * to delete this rule, not to tune it.
 *
 * They are not tuned against anything today, and they must not be tuned against
 * the evaluation questions later: those exist to produce the number that would
 * judge this rule.
 */
export const FLOW = {
  maxNodes: 6,
  maxLabelChars: 24,
} as const;

export type Presentation = 'list' | 'flow';

/** The labels a flow would put in its nodes, or undefined if the type has none. */
function flowLabels(card: KnowledgeCard): readonly string[] | undefined {
  switch (card.type) {
    case 'mechanism':
      return card.stages.map((stage) => stage.label);
    case 'procedure':
      return card.steps.map((step) => step.title);
    case 'definition':
    case 'comparison':
    case 'evidence':
      return undefined;
    default: {
      const unhandled: never = card;
      throw new Error(`Unhandled card type: ${String((unhandled as { type?: string }).type)}`);
    }
  }
}

export function presentationFor(card: KnowledgeCard): Presentation {
  const labels = flowLabels(card);
  if (!labels) return 'list';

  const scannable =
    labels.length <= FLOW.maxNodes &&
    labels.every((label) => label.length <= FLOW.maxLabelChars);

  return scannable ? 'flow' : 'list';
}
