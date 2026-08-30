import type { Evidence } from '@rgux/contracts';
import { handleFor } from '../prompt.js';

export interface HandleResolution {
  /** The plan with every known handle replaced by the evidence ID it stands for. */
  readonly plan: unknown;
  /** Handles the model wrote that were never offered. Recorded, never resolved. */
  readonly invented: readonly string[];
}

/**
 * Replace the planner's handles with the evidence IDs they stand for.
 *
 * The planner is shown `[E1]`, never a real identifier, so an invented citation
 * is a handle outside the set rather than a plausible identifier someone would
 * have to check against the corpus. The contract, though, wants real IDs — so
 * something has to map back, and that something belongs beside the code that
 * assigned the handles. Split across two modules, the two would drift and the
 * failure would look like a model error.
 *
 * Invented handles are collected and **left in place**, not deleted. Removing
 * them here would empty an `evidenceIds` array and turn a fabricated citation
 * into a schema violation — a different, less specific complaint about a card
 * that was wrong for a nameable reason. The validation pipeline (#24) decides
 * what to do with them.
 */
export function resolveHandles(plan: unknown, evidence: readonly Evidence[]): HandleResolution {
  const byHandle = new Map(evidence.map((item, index) => [handleFor(index), item.id]));
  const invented: string[] = [];

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;

    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => {
        if (key !== 'evidenceIds' || !Array.isArray(value)) return [key, walk(value)];

        return [
          key,
          value.map((entry) => {
            if (typeof entry !== 'string') return entry;
            const resolved = byHandle.get(entry);
            if (resolved !== undefined) return resolved;
            if (!invented.includes(entry)) invented.push(entry);
            return entry;
          }),
        ];
      }),
    );
  };

  return { plan: walk(plan), invented };
}
