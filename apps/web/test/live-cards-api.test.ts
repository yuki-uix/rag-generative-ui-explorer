import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { BM25Retriever } from '@rgux/corpus/bm25';
import { DEEPSEEK, plannerSchema, plannerSystemPrompt, plannerUserPrompt } from '@rgux/generation';
import { gate, type Evidence } from '@rgux/contracts';
import bundleJson from '../fixtures/retrieval-bundle.json';
import schemaJson from '../fixtures/planner-schema.json';
import actualFailure from '../fixtures/live-model-failure-v2.json';
import extractionFailure from '../fixtures/live-model-failure-v3.json';
import { handleCardsRequest, LIVE_CARDS_LIMITS, plannerSchemaForHandles, WEB_OUTPUT_INSTRUCTIONS } from '../server/live-cards.js';
import { retrievalQueryFor } from '../server/query-terms.js';
import type { LiveCardsResponse } from '../lib/live-cards-types.js';
import { OPTIONS, POST } from '../app/api/cards/route.js';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const question = 'What does BM25 compute?';
const bundle = bundleJson as unknown as { corpusVersion: string; evidence: Evidence[] };
const bm25 = new BM25Retriever(bundle.evidence);
const byId = new Map(bundle.evidence.map((entry) => [entry.id, entry]));

async function actualEvidence() {
  return (await bm25.search(question, LIVE_CARDS_LIMITS.retrievedChunks)).map((candidate) => ({
    ...byId.get(candidate.evidenceId)!,
    url: `https://github.com/yuki-uix/rag-generative-ui-explorer/blob/37813a283f9f0a2f1adc7daa373e973b3a7a0332/knowledge/${byId.get(candidate.evidenceId)!.documentId}.md`,
    retrievalScore: candidate.score,
  }));
}

async function validPlan() {
  const evidence = await actualEvidence();
  const field = { text: evidence[0]!.text.slice(0, 100), mode: 'summarized', evidenceIds: ['E1'] };
  return {
    cards: [{ id: 'actual-excerpt', type: 'definition', title: 'BM25', definition: field, keyPoints: [field] }],
    incomplete: false,
  };
}

/** Simulated HTTP only: the actual planner SDK consumes the SSE wire response. */
function modelWire(raw: string, stopReason = 'end_turn') {
  return vi.fn<typeof globalThis.fetch>(async () => {
    const events = [
      { type: 'message_start', message: {
        id: 'offline-model-message', type: 'message', role: 'assistant', model: DEEPSEEK.model, content: [],
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
  });
}

function request(body: unknown = { question }, contentType = 'application/json') {
  return new Request('https://rgux.example/api/cards', {
    method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(body),
  });
}

async function invoke(raw: string, stopReason?: string) {
  const fetch = modelWire(raw, stopReason);
  const response = await handleCardsRequest(request(), { apiKey: 'offline-test-key', fetch });
  return { response, body: await response.json() as LiveCardsResponse, fetch };
}

describe('live knowledge cards API', () => {
  it('pins the Worker schema to the existing planner schema, with no runtime filesystem reads', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    expect(schemaJson).toEqual(plannerSchema(root));
    const server = readFileSync(resolve(root, 'apps/web/server/live-cards.ts'), 'utf8');
    expect(server).not.toMatch(/node:fs|readFileSync|plannerSchema\(/);
  });

  it('describes offered handles in the web request schema and preserves real-ID validation after resolution', async () => {
    const evidence = await actualEvidence();
    const schema = plannerSchemaForHandles(evidence);
    const defs = schema.$defs as Record<string, Record<string, unknown>>;
    expect(defs.EvidenceId).toEqual({
      type: 'string', enum: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'],
      description: expect.stringContaining('Use E1, not [E1]'),
    });
    expect(defs.EvidenceId).not.toHaveProperty('pattern');
    expect(defs.GroundingMode).toEqual({ type: 'string', enum: ['summarized', 'inferred'] });
    expect(schemaJson.$defs.GroundingMode.enum).toEqual(['extractive', 'summarized', 'inferred']);
    expect(schemaJson.$defs.EvidenceId.pattern).toBeDefined();
    expect(new RegExp(schemaJson.$defs.EvidenceId.pattern).test('E1')).toBe(false);
    expect(new RegExp(schemaJson.$defs.EvidenceId.pattern).test(evidence[0]!.id)).toBe(true);
    expect((plannerSchemaForHandles(evidence.slice(0, 2)).$defs as Record<string, unknown>).EvidenceId).toMatchObject({ enum: ['E1', 'E2'] });
    expect(schema.oneOf).toEqual([
      { properties: { incomplete: { const: false }, cards: { minItems: 1 } }, not: { required: ['incompleteReason'] } },
      { properties: { incomplete: { const: true } }, required: ['incompleteReason'] },
    ]);
    const unresolved = (await validPlan()).cards;
    expect(gate(unresolved, evidence).cards).toEqual([]);
    expect(gate(unresolved, evidence).failures[0]?.stage).toBe('schema');
  });

  it('really retrieves with BM25, invokes the model once and gates a source-grounded summary card', async () => {
    const { response, body, fetch } = await invoke(JSON.stringify(await validPlan()));
    const expected = await actualEvidence();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.status).toBe('complete');
    expect(body.evidence).toEqual(expected);
    expect(body.evidence.every((item) => item.retrievalScore > 0)).toBe(true);
    expect(gate(body.cards, body.evidence).failures).toEqual([]);
    const card = body.cards[0];
    expect(card?.type).toBe('definition');
    if (card?.type === 'definition') expect(card.definition.evidenceIds).toEqual([expected[0]!.id]);
    expect(body.provenance).toMatchObject({
      corpusVersion: bundle.corpusVersion, retrieval: 'lexical-bm25', retrievedCount: 8,
      indexedChunkCount: bundle.evidence.length, schemaEnforced: false,
      validation: 'schema-and-citation-checks', model: DEEPSEEK.model,
      thinking: 'disabled', generationVersion: 'live-cards-4',
    });
    expect(body.usage).toMatchObject({ inputTokens: 100, outputTokens: 50 });
    expect(body.timing.totalMs).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    const rawBody = fetch.mock.calls[0]![1]?.body;
    expect(typeof rawBody).toBe('string');
    if (typeof rawBody !== 'string') throw new Error('Expected a JSON string request body.');
    const wireBody = JSON.parse(rawBody);
    expect(wireBody.max_tokens).toBe(LIVE_CARDS_LIMITS.outputTokens);
    expect(wireBody.thinking).toEqual({ type: 'disabled' });
    expect(wireBody.model).toBe(DEEPSEEK.model);
    expect(wireBody.system).toBe(`${plannerSystemPrompt(plannerSchemaForHandles(expected))}\n\n${WEB_OUTPUT_INSTRUCTIONS}`);
    expect(wireBody.system).toContain('first character must be {');
    expect(wireBody.system).toContain('Never use extractive in generated cards.');
    expect(wireBody.messages).toEqual([{ role: 'user', content: plannerUserPrompt(question, expected) }]);
    expect(JSON.stringify(wireBody)).toContain(expected[0]!.text.slice(0, 50).replace(/\n/g, '\\n'));
  });

  it('preserves the actual fenced model failure and does not unwrap or repair it', async () => {
    expect(actualFailure.generationVersion).toBe('live-cards-2');
    expect(actualFailure.raw.startsWith('```json')).toBe(true);
    const { response, body, fetch } = await invoke(actualFailure.raw);
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ status: 'invalid', cards: [], code: 'invalid-model-output' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects the actual v3 inaccurate extractive fields instead of converting their modes', async () => {
    expect(extractionFailure.generationVersion).toBe('live-cards-3');
    const { response, body } = await invoke(extractionFailure.raw);
    expect(response.status).toBe(422);
    expect(body.status).toBe('invalid');
    expect(body.cards).toEqual([]);
    expect('message' in body && body.message).toContain('仅接受摘要或推断');
  });

  it('narrows the web policy while the unchanged contract gate still accepts a genuine extractive span', async () => {
    const plan = await validPlan();
    plan.cards[0]!.definition.mode = 'extractive';
    const evidence = await actualEvidence();
    const resolved = structuredClone(plan);
    resolved.cards[0]!.definition.evidenceIds = [evidence[0]!.id];
    resolved.cards[0]!.keyPoints[0]!.evidenceIds = [evidence[0]!.id];
    expect(gate(resolved.cards, evidence).failures).toEqual([]);
    const { response, body } = await invoke(JSON.stringify(plan));
    expect(response.status).toBe(422);
    expect(body.cards).toEqual([]);
  });

  it('does not mutate bundled evidence when adding exact, pinned corpus-note source links', async () => {
    const { body } = await invoke(JSON.stringify(await validPlan()));
    for (const item of body.evidence) {
      const original = byId.get(item.id)!;
      expect(item.url).toBe(`https://github.com/yuki-uix/rag-generative-ui-explorer/blob/37813a283f9f0a2f1adc7daa373e973b3a7a0332/knowledge/${original.documentId}.md`);
      expect(item.text).toBe(original.text);
      expect(item.documentId).toBe(original.documentId);
      expect(original.url).toBeUndefined();
    }
  });

  it('rejects invented handles without replacing or deleting citations', async () => {
    const plan = await validPlan();
    plan.cards[0]!.definition.evidenceIds = ['E999'];
    const { response, body } = await invoke(JSON.stringify(plan));
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ status: 'invalid', code: 'invalid-model-output', cards: [] });
    expect(body.evidence).toHaveLength(8);
  });

  it('rejects an extractive statement absent from its cited passage', async () => {
    const plan = await validPlan();
    plan.cards[0]!.definition.text = 'The supplied corpus never contains this invented quotation.';
    plan.cards[0]!.definition.mode = 'extractive';
    const { response, body } = await invoke(JSON.stringify(plan));
    expect(response.status).toBe(422);
    expect(body.cards).toEqual([]);
    expect(body.status).toBe('invalid');
  });

  it('accepts evidence cards only with a resolved citation from this retrieval', async () => {
    const { body } = await invoke(JSON.stringify({
      cards: [{ id: 'sources', type: 'evidence', title: 'Sources', evidenceIds: ['E1'] }], incomplete: false,
    }));
    expect(body.status).toBe('complete');
    expect(body.cards[0]).toMatchObject({ type: 'evidence', evidenceIds: [(await actualEvidence())[0]!.id] });
    const invalid = await invoke(JSON.stringify({
      cards: [{ id: 'sources', type: 'evidence', title: 'Sources', evidenceIds: ['E999'] }], incomplete: false,
    }));
    expect(invalid.body.cards).toEqual([]);
    expect(invalid.body.status).toBe('invalid');
  });

  it.each([
    ['not JSON', 'plain provider text'],
    ['array root', '[]'],
    ['missing envelope fields', '{"cards":[]}'],
    ['empty complete answer', '{"cards":[],"incomplete":false}'],
    ['missing incomplete reason', '{"cards":[],"incomplete":true}'],
    ['extra model-owned evidence', '{"cards":[],"incomplete":true,"incompleteReason":"missing","evidence":[]}'],
    ['conflicting complete metadata', '{"cards":[],"incomplete":false,"incompleteReason":"missing"}'],
  ])('rejects %s, without exposing raw completion', async (_, raw) => {
    const { response, body } = await invoke(raw);
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ status: 'invalid', cards: [], code: 'invalid-model-output' });
    expect(body).not.toHaveProperty('raw');
  });

  it('rejects duplicate card IDs when assembling the full response', async () => {
    const plan = await validPlan();
    plan.cards.push(plan.cards[0]!);
    const { body } = await invoke(JSON.stringify(plan));
    expect(body.status).toBe('invalid');
    expect(body.cards).toEqual([]);
  });

  it('preserves model-declared insufficiency with no invented fallback', async () => {
    const { body } = await invoke('{"cards":[],"incomplete":true,"incompleteReason":"conflicting"}');
    expect(body).toMatchObject({ status: 'incomplete', incompleteReason: 'conflicting', cards: [] });
    expect(body.usage?.outputTokens).toBe(50);
  });

  it.each([
    ['missing', '检索到的片段不足以回答这个问题，未生成知识卡。'],
    ['conflicting', '检索来源存在分歧，未生成可展示知识卡。'],
  ])('explains model-declared %s without claiming partial cards when no cards exist', async (reason, message) => {
    const { response, body } = await invoke(JSON.stringify({ cards: [], incomplete: true, incompleteReason: reason }));
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'incomplete', incompleteReason: reason, cards: [], message });
    expect(body.evidence.length).toBeGreaterThan(0);
    expect(body.usage?.outputTokens).toBe(50);
  });

  it.each(['missing', 'conflicting'])('keeps supported cards visible when the model declares a partial %s answer', async (reason) => {
    const { body } = await invoke(JSON.stringify({ ...(await validPlan()), incomplete: true, incompleteReason: reason }));
    expect(body.status).toBe('incomplete');
    expect(body.cards).toHaveLength(1);
    expect('message' in body && body.message).toContain('知识卡仅展示可支持的部分');
    expect(gate(body.cards, body.evidence).failures).toEqual([]);
  });

  it('does not call a model if BM25 finds no candidate, even without a key', async () => {
    const fetch = modelWire('unreachable');
    const response = await handleCardsRequest(request({ question: 'zzzzunmatchablelexemezzzz' }), { fetch });
    expect(await response.json()).toMatchObject({ status: 'incomplete', cards: [], evidence: [], usage: null, incompleteReason: 'missing' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a readable service error when no server key is available', async () => {
    const fetch = modelWire('unreachable');
    const response = await handleCardsRequest(request(), { fetch });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'model-unavailable', cards: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sanitises provider failures, disables retries and keeps the key off the response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({
      type: 'error', error: { type: 'api_error', message: 'SECRET_PROVIDER_BODY offline-test-key' },
    }), { status: 503, headers: { 'content-type': 'application/json' } }));
    const response = await handleCardsRequest(request(), { fetch, apiKey: 'offline-test-key' });
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toContain('provider-error');
    expect(text).not.toMatch(/SECRET_PROVIDER_BODY|offline-test-key/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['max_tokens', 'refusal', 'stop_sequence'])('does not render cards from a %s stop', async (stop) => {
    const { response, body } = await invoke(JSON.stringify(await validPlan()), stop);
    expect(response.status).toBe(422);
    expect(body.cards).toEqual([]);
    expect(body.status).toBe('invalid');
  });

  it.each([
    [null], [[]], [{}], [{ question: 1 }], [{ question: '   ' }], [{ question, evidence: [] }],
    [{ question: 'x'.repeat(1001) }],
  ])('rejects invalid request %# before calling the model', async (body) => {
    const fetch = modelWire('unreachable');
    const response = await handleCardsRequest(request(body), { apiKey: 'offline-test-key', fetch });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 'error', cards: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON, unsupported content type and oversized bodies', async () => {
    const fetch = modelWire('unreachable');
    const malformed = new Request('https://rgux.example/api/cards', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    });
    expect((await handleCardsRequest(malformed, { fetch })).status).toBe(400);
    expect((await handleCardsRequest(request({ question }, 'text/plain'), { fetch })).status).toBe(415);
    expect((await handleCardsRequest(request({ question: '你'.repeat(3000) }), { fetch })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aborts a hanging model request on the server deadline', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_, init) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Private abort detail', 'AbortError')), { once: true });
    }));
    const response = await handleCardsRequest(request(), { apiKey: 'offline-test-key', fetch, timeoutMs: 20 });
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'model-timeout', cards: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('expands explicit Chinese technical terms for real retrieval and preserves the original model question', async () => {
    const chinese = '稀疏检索和稠密检索有什么区别？';
    const fetch = modelWire('{"cards":[],"incomplete":true,"incompleteReason":"missing"}');
    const response = await handleCardsRequest(request({ question: chinese }), { apiKey: 'offline-test-key', fetch });
    const body = await response.json() as LiveCardsResponse;
    expect(body.question).toBe(chinese);
    expect(body.provenance).toMatchObject({
      retrievalQuery: `${chinese}\nsparse retrieval dense retrieval`, queryExpansion: 'technical-terms-v1',
    });
    expect(body.evidence.some((item) => item.documentId === 'rag/sparse-retrieval')).toBe(true);
    expect(body.evidence.some((item) => item.documentId === 'rag/dense-retrieval')).toBe(true);
    const rawBody = fetch.mock.calls[0]![1]?.body;
    expect(typeof rawBody).toBe('string');
    if (typeof rawBody !== 'string') throw new Error('Expected a JSON string request body.');
    const wireBody = JSON.parse(rawBody);
    expect(wireBody.messages[0].content).toContain(chinese);
    expect(retrievalQueryFor('What is BM25?')).toEqual({ retrievalQuery: 'What is BM25?', queryExpansion: 'none' });
  });

  it('does not turn unrelated Chinese into a technical query or call the model', async () => {
    const fetch = modelWire('unreachable');
    const response = await handleCardsRequest(request({ question: '今天晚饭吃什么？' }), { apiKey: 'offline-test-key', fetch });
    const body = await response.json() as LiveCardsResponse;
    expect(body).toMatchObject({ status: 'incomplete', evidence: [], usage: null });
    expect(body.provenance.queryExpansion).toBe('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels an unreadable body when the caller aborts, even when cancel never resolves', async () => {
    const controller = new AbortController();
    const cancelled = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const slow = new Request('https://rgux.example/api/cards', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: stream,
      signal: controller.signal, duplex: 'half',
    } as RequestInit);
    const fetch = modelWire('unreachable');
    const pending = handleCardsRequest(slow, { apiKey: 'offline-test-key', fetch });
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'request-cancelled' });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds body read time before retrieval or model invocation', async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const slow = new Request('https://rgux.example/api/cards', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half',
    } as RequestInit);
    const fetch = modelWire('unreachable');
    const response = await handleCardsRequest(slow, { apiKey: 'offline-test-key', fetch, bodyTimeoutMs: 20 });
    expect(response.status).toBe(408);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'request-timeout' });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds a model stream that sends headers but never finishes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new ReadableStream<Uint8Array>(), {
      headers: { 'content-type': 'text/event-stream' },
    }));
    const response = await handleCardsRequest(request(), { apiKey: 'offline-test-key', fetch, timeoutMs: 20 });
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'model-timeout', cards: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not declare a whitespace-only factual field a complete visible answer', async () => {
    const plan = await validPlan();
    plan.cards[0]!.definition.text = ' \n\t ';
    const { response, body } = await invoke(JSON.stringify(plan));
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ status: 'invalid', code: 'invalid-model-output', cards: [] });
  });

  it('returns a readable invalid result for deeply nested untrusted model cards', async () => {
    const nested = '['.repeat(5000) + 'null' + ']'.repeat(5000);
    const { response, body } = await invoke(`{"cards":[${nested}],"incomplete":false}`);
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ status: 'invalid', code: 'invalid-model-output', cards: [] });
  });

  it('rejects oversized model JSON trees before recursive handle resolution', async () => {
    const { response, body } = await invoke(JSON.stringify({
      cards: [{ extra: Array.from({ length: LIVE_CARDS_LIMITS.modelJsonNodes + 1 }, () => null) }],
      incomplete: false,
    }));
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ status: 'invalid', cards: [] });
    expect('message' in body && body.message).toContain('结构过于复杂');
  });

  it('accepts the largest contract card shape within the model JSON traversal budget', async () => {
    const field = { text: 'A synthetic summary used to test shape limits.', mode: 'summarized', evidenceIds: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'] };
    const cards = Array.from({ length: 4 }, (_, card) => ({
      id: `max-comparison-${card}`, type: 'comparison', title: 'Shape boundary test',
      entities: ['A', 'B', 'C', 'D'],
      rows: Array.from({ length: 8 }, (_, row) => ({ dimension: `Row ${row}`, values: [field, field, field, field] })),
    }));
    const { response, body } = await invoke(JSON.stringify({ cards, incomplete: false }));
    expect(response.status).toBe(200);
    expect(body.status).toBe('complete');
    expect(body.cards).toHaveLength(4);
  });

  it('cancels an unread request body when invalid UTF-8 is detected', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xff])); },
      cancel,
    });
    const bad = new Request('https://rgux.example/api/cards', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
    } as RequestInit);
    const fetch = modelWire('unreachable');
    const response = await handleCardsRequest(bad, { apiKey: 'offline-test-key', fetch });
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels generation after the model has returned streaming headers', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      started();
      return new Response(new ReadableStream<Uint8Array>(), { headers: { 'content-type': 'text/event-stream' } });
    });
    const live = new Request('https://rgux.example/api/cards', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }), signal: controller.signal,
    });
    const pending = handleCardsRequest(live, { apiKey: 'offline-test-key', fetch });
    await ready;
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'request-cancelled', cards: [] });
    expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honours a caller cancellation without starting a model request', async () => {
    const controller = new AbortController();
    const fetch = modelWire('unreachable');
    const cancelled = new Request('https://rgux.example/api/cards', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }), signal: controller.signal,
    });
    controller.abort();
    const response = await handleCardsRequest(cancelled, { apiKey: 'offline-test-key', fetch });
    expect(response.status).toBe(408);
    expect(fetch).not.toHaveBeenCalled();
  });
});


describe('cards route CORS boundary', () => {
  it.each(['https://yuki-uix.github.io', 'http://localhost:4174', 'http://127.0.0.1:5173'])('permits the explicit %s frontend', async (origin) => {
    const response = await OPTIONS(new Request('https://rgux.example/api/cards', { method: 'OPTIONS', headers: { origin } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each(['https://evil.example', 'null', 'https://yuki-uix.github.io.evil.example', 'http://localhost:9999'])('does not reflect %s', async (origin) => {
    const response = await OPTIONS(new Request('https://rgux.example/api/cards', { method: 'OPTIONS', headers: { origin } }));
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const posted = await POST(new Request('https://rgux.example/api/cards', { method: 'POST', headers: { origin } }));
    expect(posted.status).toBe(403);
    expect(posted.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('includes CORS headers on a readable handler error', async () => {
    const original = request();
    original.headers.set('origin', 'https://yuki-uix.github.io');
    const response = await POST(original);
    expect(response.status).toBe(503);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://yuki-uix.github.io');
    expect(await response.json()).toMatchObject({ status: 'error', code: 'model-unavailable' });
  });
});
