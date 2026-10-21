import { z } from 'zod';
import { Evidence, KnowledgeUIResponse, type Evidence as EvidenceType, type KnowledgeUIResponse as Response } from '@rgux/contracts';
import { EvalQuestion } from '@rgux/corpus';
import type { PlanRecord } from '../planner/plan.js';
import type { RequestRecord } from './transport.js';

const usage = z.object({ inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
  cacheCreationInputTokens: z.number().int().nonnegative().nullable(), cacheReadInputTokens: z.number().int().nonnegative().nullable() });
const plan = z.object({ profileId: z.string(), model: z.string(), promptVersion: z.string(), schemaEnforced: z.boolean(),
  raw: z.string(), stopReason: z.string().nullable(), usage, latencyMs: z.number().nonnegative() });
const request = z.object({ url: z.url(), method: z.string(), body: z.unknown(), status: z.number().int().nullable(),
  startedAt: z.iso.datetime().optional(), completedAt: z.iso.datetime().optional() });
const common = { question: EvalQuestion, evidence: z.array(Evidence), result: KnowledgeUIResponse.nullable() };
const observation = z.union([
  z.object({ ...common, implementation: z.enum(['native', 'langchain']), attempts: z.array(plan), requests: z.array(request) }),
  z.object({ ...common, implementation: z.literal('langgraph'), calls: z.array(z.object({ kind: z.enum(['coverage', 'rewrite', 'generation']), plan: plan.nullable(), requests: z.array(request) })) }),
]);
const rows = z.array(z.object({ arm: z.enum(['native', 'langchain', 'langgraph']), repetition: z.number().int().positive(),
  startedAt: z.iso.datetime().optional(), completedAt: z.iso.datetime().optional(), observed: observation }));

/** Only the fields consumed by the audit are exposed. Original logs are never
 * rewritten or asserted wholesale to be trusted runtime records. */
export interface AuditRecord {
  arm: string;
  repetition: number;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  observed: {
    question: EvalQuestion; evidence: EvidenceType[]; result: Response | null;
  } & ({ implementation: string; attempts: PlanRecord[]; requests: RequestRecord[] }
    | { implementation: 'langgraph'; calls: { kind: string; plan: PlanRecord | null; requests: RequestRecord[] }[] });
}

export function parseAuditRecords(source: unknown): AuditRecord[] {
  const parsed = rows.parse(source);
  if (parsed.some((row) => row.arm !== row.observed.implementation)) throw new Error('Record arm and implementation disagree.');
  return parsed;
}
