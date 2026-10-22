import { KnowledgeUIResponse, gate, type Evidence } from '@rgux/contracts';
import { BM25Retriever } from '@rgux/corpus/bm25';
import { DEEPSEEK, PLANNER_PROMPT_VERSION, planCards, resolveHandles, handleFor } from '@rgux/generation';
import bundleJson from '../fixtures/retrieval-bundle.json';
import schemaJson from '../fixtures/planner-schema.json';
import { retrievalQueryFor } from './query-terms.js';
import type {
  LiveCardsErrorCode,
  LiveCardsProvenance,
  LiveCardsResponse,
  LiveCardsTiming,
  LiveCardsUsage,
} from '../lib/live-cards-types.js';

export const LIVE_CARDS_LIMITS = {
  questionCharacters: 1000,
  bodyBytes: 8192,
  bodyTimeoutMs: 5000,
  retrievedChunks: 8,
  outputTokens: 4096,
  modelJsonDepth: 32,
  modelJsonNodes: 4096,
  timeoutMs: 60_000,
} as const;

const CORPUS_COMMIT = '37813a283f9f0a2f1adc7daa373e973b3a7a0332';
export const WEB_OUTPUT_INSTRUCTIONS = [
  'Web output contract (live-cards-5):',
  'Return one JSON object only. Its first character must be { and its last character must be }. Never use Markdown code fences or backticks.',
  'For every model-written factual field, use only summarized or inferred. Use summarized for supported summaries, translations, paraphrases, rewrites, and derived questions; use inferred only for a conclusion supported indirectly by the cited passages.',
  'Never use extractive in generated cards. Verbatim excerpts are displayed directly from the corpus in the source drawer and evidence card, without model-authored quotation.',
  'Preserve the scope, qualifiers, modality, and strength of the cited evidence in card titles, labels, and factual fields. Keep conditions such as a fixed candidate set, the candidate-set size versus a smaller display cutoff, a particular corpus, or a project-specific plan explicit.',
  'Never turn a rationale or recommendation into a claim about real-world practice frequency, a universal guarantee, or measured performance. Make those stronger claims only when the particular cited passages explicitly support them.',
  'Each factual field must cite the particular passages supporting that exact claim and its qualifiers. Do not borrow a fact from an uncited neighboring passage just because it was also retrieved.',
  'If the cited evidence supports only a narrower statement, state the narrower claim or omit it. Report incomplete when the available evidence cannot fully answer the question.',
].join('\n');

function corpusNoteUrl(documentId: string): string {
  const path = documentId.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `https://github.com/yuki-uix/rag-generative-ui-explorer/blob/${CORPUS_COMMIT}/knowledge/${path}.md`;
}

const bundle = bundleJson as unknown as {
  corpusVersion: string;
  retrieval: 'lexical-bm25';
  evidence: Evidence[];
};
const retriever = new BM25Retriever(bundle.evidence);
const byId = new Map(bundle.evidence.map((item) => [item.id, item]));

export interface LiveCardsOptions {
  apiKey?: string;
  /** Replace the model's HTTP wire only; retrieval, planning and validation remain real. */
  fetch?: typeof globalThis.fetch;
  /** A shorter deadline is useful to exercise cancellation in offline tests. */
  timeoutMs?: number;
  bodyTimeoutMs?: number;
}

type PlannerEnvelope =
  | { cards: unknown[]; incomplete: false }
  | { cards: unknown[]; incomplete: true; incompleteReason: 'missing' | 'conflicting' };

/** Check the planner's envelope before resolving identifiers or validating cards. */
function plannerEnvelope(value: unknown): PlannerEnvelope | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.cards) || plan.cards.length > 4) return null;
  if (plan.incomplete === false && plan.cards.length > 0 &&
      Object.keys(plan).every((key) => key === 'cards' || key === 'incomplete')) {
    return { cards: plan.cards, incomplete: false };
  }
  if (plan.incomplete === true &&
      (plan.incompleteReason === 'missing' || plan.incompleteReason === 'conflicting') &&
      Object.keys(plan).every((key) => ['cards', 'incomplete', 'incompleteReason'].includes(key))) {
    return { cards: plan.cards, incomplete: true, incompleteReason: plan.incompleteReason };
  }
  return null;
}

class RequestFailure extends Error {
  constructor(readonly code: LiveCardsErrorCode, readonly status: number, message: string) {
    super(message);
  }
}

async function readQuestion(request: Request, bodyTimeoutMs: number): Promise<string> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new RequestFailure('unsupported-content-type', 415, '请使用 JSON 提交问题。');
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > LIVE_CARDS_LIMITS.bodyBytes) {
    throw new RequestFailure('request-too-large', 413, '请求内容过大，请缩短问题。');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestFailure('invalid-request', 400, '请填写一个问题。');
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), bodyTimeoutMs);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new RequestFailure(
        request.signal.aborted ? 'request-cancelled' : 'request-timeout', 408,
        request.signal.aborted ? '请求已取消。' : '读取问题超时，请重新提交。',
      ));
      // Reject before cancelling: cancellation can settle an in-flight read as done.
      // Do not await cancel: an uncooperative stream may never settle it.
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIVE_CARDS_LIMITS.bodyBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestFailure('request-too-large', 413, '请求内容过大，请缩短问题。');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    // A decoding/read failure can happen while the client is still streaming.
    // Release the unread body without waiting for an uncooperative cancel hook.
    void reader.cancel().catch(() => {});
    if (error instanceof RequestFailure) throw error;
    throw new RequestFailure('invalid-request', 400, '无法读取问题，请重新提交。');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new RequestFailure('invalid-request', 400, '请求不是有效的 JSON。'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).some((key) => key !== 'question') ||
      !('question' in parsed) || typeof parsed.question !== 'string' || !parsed.question.trim()) {
    throw new RequestFailure('invalid-request', 400, '请填写一个非空的问题。');
  }
  const question = parsed.question.trim();
  if (question.length > LIVE_CARDS_LIMITS.questionCharacters) {
    throw new RequestFailure('question-too-long', 400, `问题最多 ${LIVE_CARDS_LIMITS.questionCharacters} 个字符。`);
  }
  return question;
}

/**
 * The persisted contract validates corpus IDs after handle resolution. The model
 * sees only E1...En, so its request schema must describe those offered handles.
 * Card shapes remain generated from the unchanged contracts; the final gate
 * still validates real corpus IDs, exact extraction, and this retrieval set.
 */
export function plannerSchemaForHandles(evidence: readonly Evidence[]): Record<string, unknown> {
  const schema = structuredClone(schemaJson) as Record<string, unknown>;
  const defs = schema.$defs as Record<string, unknown>;
  if (!defs || !('EvidenceId' in defs) || !('GroundingMode' in defs)) {
    throw new Error('Planner schema is missing a required evidence or grounding definition.');
  }
  defs.EvidenceId = {
    type: 'string',
    enum: evidence.map((_, index) => handleFor(index)),
    description: 'One exact evidence handle offered in this request. Use E1, not [E1] or a fabricated corpus identifier.',
  };
  // Web-generated text is summarized/inferred. Literal excerpts come from the
  // original evidence drawer; never repair a model's inaccurate extractive claim.
  defs.GroundingMode = { type: 'string', enum: ['summarized', 'inferred'] };
  // Match the existing strict planner envelope instead of asking the model for
  // an optional reason even when it declares a complete answer.
  schema.oneOf = [
    { properties: { incomplete: { const: false }, cards: { minItems: 1 } }, not: { required: ['incompleteReason'] } },
    { properties: { incomplete: { const: true } }, required: ['incompleteReason'] },
  ];
  return schema;
}

function generatedCardPolicy(value: unknown): 'extractive' | 'complexity' | 'blank' | null {
  // Inspect untrusted model JSON without recursion. The later handle resolver
  // is recursive, so refuse excessive depth before it can receive the value.
  const pending = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (++visited > LIVE_CARDS_LIMITS.modelJsonNodes || item.depth > LIVE_CARDS_LIMITS.modelJsonDepth) {
      return 'complexity';
    }
    if (typeof item.value === 'string' && item.value.trim().length === 0) return 'blank';
    if (item.value === null || typeof item.value !== 'object') continue;
    const object = item.value as Record<string, unknown>;
    if (!Array.isArray(item.value) && object.mode === 'extractive') return 'extractive';
    const children = Array.isArray(item.value) ? item.value : Object.values(object);
    if (visited + pending.length + children.length > LIVE_CARDS_LIMITS.modelJsonNodes) {
      return 'complexity';
    }
    for (const child of children) pending.push({ value: child, depth: item.depth + 1 });
  }
  return null;
}

/**
 * One real retrieval and at most one model invocation. No repair or sample fallback.
 * This checks structure and citation provenance; it does not verify factual entailment.
 */
export async function handleCardsRequest(request: Request, options: LiveCardsOptions): Promise<Response> {
  const started = performance.now();
  let question = '';
  let evidence: Evidence[] = [];
  let usage: LiveCardsUsage | null = null;
  const timing: LiveCardsTiming = { retrievalMs: 0, generationMs: 0, validationMs: 0, totalMs: 0 };
  const provenance: LiveCardsProvenance = {
    corpusVersion: bundle.corpusVersion,
    retrieval: bundle.retrieval,
    retrievalQuery: '',
    queryExpansion: 'none',
    retrievedCount: 0,
    indexedChunkCount: bundle.evidence.length,
    profileId: DEEPSEEK.id,
    model: DEEPSEEK.model,
    promptVersion: PLANNER_PROMPT_VERSION,
    schemaEnforced: DEEPSEEK.enforcesOutputSchema,
    thinking: 'disabled',
    generationVersion: 'live-cards-5',
    generatedAt: new Date().toISOString(),
    validation: 'schema-and-citation-checks',
  };
  const respond = (body: Pick<LiveCardsResponse, 'status' | 'cards'> & Record<string, unknown>, status = 200) => {
    timing.totalMs = performance.now() - started;
    return Response.json({ question, evidence, provenance, usage, timing, ...body }, {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  };
  const fail = (code: LiveCardsErrorCode, message: string, status: number, invalid = false) =>
    respond({ status: invalid ? 'invalid' : 'error', cards: [], code, message }, status);

  if (request.signal.aborted) return fail('request-cancelled', '请求已取消。', 408);
  try { question = await readQuestion(request, Math.min(options.bodyTimeoutMs ?? LIVE_CARDS_LIMITS.bodyTimeoutMs, LIVE_CARDS_LIMITS.bodyTimeoutMs)); }
  catch (error) {
    if (error instanceof RequestFailure) return fail(error.code, error.message, error.status);
    return fail('invalid-request', '无法读取问题，请重新提交。', 400);
  }
  if (request.signal.aborted) return fail('request-cancelled', '请求已取消。', 408);

  const expanded = retrievalQueryFor(question);
  provenance.retrievalQuery = expanded.retrievalQuery;
  provenance.queryExpansion = expanded.queryExpansion;
  const retrievalStart = performance.now();
  evidence = (await retriever.search(expanded.retrievalQuery, LIVE_CARDS_LIMITS.retrievedChunks)).flatMap((candidate) => {
    const item = byId.get(candidate.evidenceId);
    return item ? [{ ...item, url: corpusNoteUrl(item.documentId), retrievalScore: candidate.score }] : [];
  });
  timing.retrievalMs = performance.now() - retrievalStart;
  provenance.retrievedCount = evidence.length;
  if (request.signal.aborted) return fail('request-cancelled', '请求已取消。', 408);
  if (evidence.length === 0) {
    return respond({
      status: 'incomplete', cards: [], incompleteReason: 'missing',
      message: '当前语料没有检索到匹配片段，未调用模型或编造知识卡。可以尝试具体的技术名称或英文关键词。',
    });
  }
  if (!options.apiKey?.trim()) {
    return fail('model-unavailable', '实时生成服务尚未配置。已保留本次检索来源，请稍后重试。', 503);
  }

  const deadline = new AbortController();
  const timeoutMs = Math.min(options.timeoutMs ?? LIVE_CARDS_LIMITS.timeoutMs, LIVE_CARDS_LIMITS.timeoutMs);
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  const transport = options.fetch ?? globalThis.fetch;
  const wire: typeof globalThis.fetch = (input, init) => {
    // DeepSeek documents thinking as enabled/high by default, including its
    // Anthropic-compatible endpoint. This production web adapter disables it
    // without changing the frozen generation profile or planner prompt.
    // https://api-docs.deepseek.com/guides/thinking_mode/
    // https://api-docs.deepseek.com/guides/anthropic_api/
    if (typeof init?.body !== 'string') throw new Error('Unexpected planner request body.');
    const body: unknown = JSON.parse(init.body);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Unexpected planner request shape.');
    }
    const payload = body as Record<string, unknown>;
    if (typeof payload.system !== 'string') throw new Error('Unexpected planner system prompt.');
    return transport(input, {
      ...init,
      body: JSON.stringify({
        ...payload,
        system: `${payload.system}\n\n${WEB_OUTPUT_INSTRUCTIONS}`,
        thinking: { type: 'disabled' },
      }),
      signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });
  };
  let onGenerationAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onGenerationAbort = () => reject(new DOMException('Generation cancelled', 'AbortError'));
    signal.addEventListener('abort', onGenerationAbort, { once: true });
    if (signal.aborted) onGenerationAbort();
  });
  let record: Awaited<ReturnType<typeof planCards>>;
  const generationStart = performance.now();
  try {
    record = await Promise.race([planCards({
      profile: DEEPSEEK, question, evidence, schema: plannerSchemaForHandles(evidence), apiKey: options.apiKey,
      maxTokens: LIVE_CARDS_LIMITS.outputTokens, maxRetries: 0, timeoutMs,
      fetch: wire,
    }), aborted]);
    usage = record.usage;
    provenance.model = record.model;
  } catch {
    timing.generationMs = performance.now() - generationStart;
    if (request.signal.aborted) return fail('request-cancelled', '请求已取消。', 408);
    if (deadline.signal.aborted) return fail('model-timeout', '生成超时，请稍后重试。', 504);
    // SDK errors can contain provider bodies and credentials. Never serialise them.
    return fail('provider-error', '模型服务暂时未能完成请求，请稍后重试。', 502);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onGenerationAbort);
  }
  timing.generationMs = performance.now() - generationStart;
  if (record.stopReason !== 'end_turn') {
    if (record.stopReason === 'max_tokens') return fail('generation-truncated', '模型输出超过本次长度限制，未展示未完成的知识卡。请缩小问题范围。', 422, true);
    if (record.stopReason === 'refusal') return fail('generation-refused', '模型未生成可展示的知识卡，请调整问题。', 422, true);
    return fail('invalid-model-output', '模型未正常结束生成，未展示知识卡。请重试。', 422, true);
  }

  const validationStart = performance.now();
  const invalid = (message: string) => {
    timing.validationMs = performance.now() - validationStart;
    return fail('invalid-model-output', message, 422, true);
  };
  let parsed: unknown;
  try { parsed = JSON.parse(record.raw); }
  catch { return invalid('模型未返回有效的知识卡 JSON，本次输出未展示。请重试。'); }
  const envelope = plannerEnvelope(parsed);
  if (!envelope) return invalid('模型返回的知识卡结构不符合约定，本次输出未展示。请重试。');
  const policy = generatedCardPolicy(envelope.cards);
  if (policy === 'complexity') return invalid('模型返回的知识卡嵌套过深或结构过于复杂，本次输出未展示。请重试。');
  if (policy === 'blank') return invalid('模型返回的知识卡含有空白内容，本次输出未展示。请重试。');
  if (policy === 'extractive') return invalid('网页生成卡仅接受摘要或推断，原文请从来源查看。本次模型标注不符合约定，未展示知识卡。');
  const resolved = resolveHandles(envelope, evidence);
  if (resolved.invented.length > 0) return invalid('模型引用了本次检索未提供的来源，本次知识卡未展示。请重试。');
  const plan = resolved.plan as PlannerEnvelope;
  const validated = gate(plan.cards, evidence);
  if (validated.failures.length > 0) return invalid('知识卡未通过结构、引用或原文摘录检查，本次输出未展示。请重试。');
  const retrievedIds = new Set(evidence.map((item) => item.id));
  if (validated.cards.some((card) => card.type === 'evidence' && card.evidenceIds.some((id) => !retrievedIds.has(id)))) {
    return invalid('来源卡引用了本次检索未提供的片段，本次输出未展示。请重试。');
  }
  const response = KnowledgeUIResponse.safeParse({
    query: question, cards: validated.cards, suggestedActions: [], evidence,
    metadata: {
      knowledgeBaseVersion: bundle.corpusVersion, generatedAt: provenance.generatedAt,
      incomplete: plan.incomplete,
      ...(plan.incomplete ? { incompleteReason: plan.incompleteReason } : {}),
    },
  });
  if (!response.success) return invalid('知识卡集合未通过完整响应检查，本次输出未展示。请重试。');
  timing.validationMs = performance.now() - validationStart;
  return respond({
    status: plan.incomplete ? 'incomplete' : 'complete', cards: validated.cards,
    ...(plan.incomplete ? {
      incompleteReason: plan.incompleteReason,
      message: validated.cards.length === 0
        ? (plan.incompleteReason === 'conflicting'
            ? '检索来源存在分歧，未生成可展示知识卡。'
            : '检索到的片段不足以回答这个问题，未生成知识卡。')
        : (plan.incompleteReason === 'conflicting'
            ? '检索来源存在分歧，知识卡仅展示可支持的部分。'
            : '当前检索证据不足，知识卡仅展示可支持的部分。'),
    } : {}),
  });
}
