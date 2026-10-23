import type { ExperimentRecord } from './run.js';

function differingPaths(left: unknown, right: unknown, path = ''): string[] {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      .flatMap((key) => differingPaths(a[key], b[key], path ? `${path}.${key}` : key));
  }
  return [path];
}

export function requestText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((block: { text?: string }) => block.text ?? '').join('');
  return '';
}

/** Keep actual payload differences visible; compare prompt text independently. */
export function compareRecords(records: readonly ExperimentRecord[]) {
  const native = records.filter((record) => record.implementation === 'native');
  return native.map((left) => {
    const right = records.find((record) => record.implementation === 'langchain' && record.question.id === left.question.id);
    if (!right) throw new Error(`Missing LangChain pair: ${left.question.id}`);
    const a = left.requests[0]?.body as Record<string, unknown> | undefined;
    const b = right.requests[0]?.body as Record<string, unknown> | undefined;
    const messages = (body: Record<string, unknown>) => (body['messages'] as { role: string; content: unknown }[])
      .map((message) => ({ role: message.role, content: requestText(message.content) }));
    const sameEvidence = JSON.stringify(left.evidence) === JSON.stringify(right.evidence);
    const samePrompt = a && b ? requestText(a['system']) === requestText(b['system']) && JSON.stringify(messages(a)) === JSON.stringify(messages(b)) : null;
    const effort = (body: Record<string, unknown>) => (body['output_config'] as Record<string, unknown> | undefined)?.['effort'];
    const sameModelSettings = a && b ? ['model', 'max_tokens', 'stream', 'thinking', 'temperature', 'top_p', 'top_k'].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key])) && effort(a) === effort(b) : null;
    if (!sameEvidence || samePrompt === false || sameModelSettings === false) {
      throw new Error(`Comparison invariants changed for ${left.question.id}; inspect saved records.`);
    }
    return {
      questionId: left.question.id, sameEvidence, samePrompt, sameModelSettings,
      requestBodyDifferences: a && b ? differingPaths(a, b) : null,
      native: { outcome: left.outcome, latencyMs: left.timingMs.generation, usage: left.attempts[0]?.usage ?? null },
      langchain: { outcome: right.outcome, latencyMs: right.timingMs.generation, usage: right.attempts[0]?.usage ?? null },
    };
  });
}
