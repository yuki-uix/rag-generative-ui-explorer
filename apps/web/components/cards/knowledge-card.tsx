import type { Evidence, GatedCard } from '@rgux/contracts';
import { ComparisonCard } from './comparison-card.js';
import { DefinitionCard } from './definition-card.js';
import { EvidenceCard } from './evidence-card.js';
import { MechanismCard } from './mechanism-card.js';
import { ProcedureCard } from './procedure-card.js';

/**
 * A closed lookup on the discriminator. Nothing is constructed from model
 * output: the model supplies a `type`, and `type` selects among components that
 * were written and reviewed here.
 *
 * The `never` branch is what keeps this closed over time. Adding a member to
 * the contract's union without adding a component here fails the build rather
 * than falling through to a default at runtime — the same reason the card
 * vocabulary is derived from the union instead of written out.
 *
 * Presentation is a pure function of the card. When #51 adds an alternate
 * rendering it is selected from the card's own shape here; the model never
 * names one.
 *
 * The prop is `GatedCard`, not `KnowledgeCard` (#26). Only `gate` in
 * `@rgux/contracts` produces that type, so a caller holding unvalidated model
 * output cannot reach this component at all — the failure is a type error at
 * the call site rather than a rule someone has to remember. Every other render
 * path inherits the same constraint by passing through here.
 */
export function KnowledgeCard({
  card,
  resolveEvidence,
}: {
  card: GatedCard;
  resolveEvidence?: (evidenceId: string) => Evidence | undefined;
}) {
  switch (card.type) {
    case 'definition':
      return <DefinitionCard card={card} />;
    case 'comparison':
      return <ComparisonCard card={card} />;
    case 'mechanism':
      return <MechanismCard card={card} />;
    case 'procedure':
      return <ProcedureCard card={card} />;
    case 'evidence':
      return <EvidenceCard card={card} resolve={resolveEvidence} />;
    default: {
      const unhandled: never = card;
      throw new Error(
        `No component for card type: ${String((unhandled as { type?: string }).type)}`,
      );
    }
  }
}
