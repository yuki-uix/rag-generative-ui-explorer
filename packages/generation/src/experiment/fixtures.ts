import type { Evidence } from '@rgux/contracts';
import type { EvalQuestion } from '@rgux/corpus';

export const SCENARIOS = ['valid', 'malformed', 'invalid-reference', 'provider-error', 'truncated', 'refusal'] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** Synthetic completions test plumbing, never answer quality or framework benefit. */
export function fixtureCompletion(question: EvalQuestion, evidence: readonly Evidence[], scenario: Scenario): string {
  if (scenario === 'malformed') return '{"cards":';
  const field = (index: number) => ({
    text: evidence[index]!.text.slice(0, 160),
    mode: 'extractive',
    evidenceIds: [scenario === 'invalid-reference' ? 'E999' : `E${index + 1}`],
  });
  // Failure fixtures deliberately exercise a card even on the insufficient sample.
  if (question.expectInsufficient && scenario !== 'invalid-reference') {
    return JSON.stringify({ cards: [], incomplete: true, incompleteReason: 'missing' });
  }
  if (evidence.length < 2) throw new Error('Smoke fixture needs at least two retrieved passages.');
  const card = question.expectedCardTypes.includes('comparison')
    ? {
        id: 'smoke-comparison', type: 'comparison', title: 'Synthetic comparison fixture',
        entities: evidence.slice(0, 2).map((item) => item.documentTitle),
        rows: [{ dimension: 'Retrieved excerpt', values: [field(0), field(1)] }],
      }
    : {
        id: 'smoke-definition', type: 'definition', title: 'Synthetic definition fixture',
        definition: field(0), keyPoints: [field(1)],
      };
  return JSON.stringify({ cards: [card], incomplete: false });
}

/** An Anthropic SSE response, consumed by the actual SDK and actual planner. */
export function fixtureFetch(raw: string, scenario: Scenario): typeof globalThis.fetch {
  return async () => {
    if (scenario === 'provider-error') {
      return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Synthetic provider failure' } }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    const stopReason = scenario === 'truncated' ? 'max_tokens' : scenario === 'refusal' ? 'refusal' : 'end_turn';
    const events = [
      { type: 'message_start', message: {
        id: 'smoke-message', type: 'message', role: 'assistant', model: 'offline-fixture', content: [],
        stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 },
      } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: raw } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 50 } },
      { type: 'message_stop' },
    ];
    return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
  };
}
