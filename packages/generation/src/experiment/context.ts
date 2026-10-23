import type { Evidence } from '@rgux/contracts';
import { plannerUserPrompt } from '../planner/prompt.js';

/** Selection uses retrieval order, never golden labels or incomparable scores.
 * Balanced replacement reserves half the slots for the original context, then
 * prioritizes novel supplemental passages. Unfilled slots use remaining order. */
export function selectContext(
  question: string, previous: readonly Evidence[], candidates: readonly Evidence[],
  policy: { maxEvidence: number; maxContextChars: number; evidenceSelection?: 'balanced' | undefined },
): Evidence[] {
  if (plannerUserPrompt(question, []).length > policy.maxContextChars) throw new Error('Question exceeds context cap.');
  const oldIds = new Set(previous.map((item) => item.id));
  const novel = candidates.filter((item) => !oldIds.has(item.id));
  const reserved = Math.ceil(policy.maxEvidence / 2);
  const ordered = policy.evidenceSelection === 'balanced' && previous.length
    ? [...previous.slice(0, reserved), ...novel, ...previous.slice(reserved), ...candidates]
    : [...previous, ...candidates];
  const selected: Evidence[] = [];
  const seen = new Set<string>();
  for (const item of ordered) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (selected.length < policy.maxEvidence && plannerUserPrompt(question, [...selected, item]).length <= policy.maxContextChars) selected.push(item);
  }
  return selected;
}
