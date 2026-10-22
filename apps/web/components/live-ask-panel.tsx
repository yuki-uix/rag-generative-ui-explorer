'use client';

import { useEffect, useRef, useState } from 'react';
import { Evidence, gate } from '@rgux/contracts';
import type { GateResult } from '@rgux/contracts';
import type {
  LiveCardsProvenance,
  LiveCardsTiming,
  LiveCardsUsage,
} from '../lib/live-cards-types.js';
import { KnowledgeCard } from './cards/knowledge-card.js';
import { SourceDrawerProvider } from './cards/source-drawer.js';

const SUGGESTIONS = [
  '稀疏检索和稠密检索有什么区别？',
  '为什么重排不能提高召回率？',
  'How should I evaluate retrieval quality?',
];

interface Run {
  status: 'complete' | 'incomplete' | 'invalid' | 'error';
  evidence: Evidence[];
  result: GateResult;
  rejectedCount: number;
  provenance: LiveCardsProvenance;
  timing: LiveCardsTiming;
  usage: LiveCardsUsage | null;
  message: string | undefined;
  failureCode: string | undefined;
}

const CLIENT_DEADLINE_MS = 75_000;

/** Only messages created by this client may reach its request-error notice. */
class ResponseProblem extends Error {}

function failureMessage(code: unknown, httpStatus: number): string {
  let message: string;
  switch (code) {
    case 'rate-limited':
      message = '提问过于频繁，请稍后重试。';
      break;
    case 'service-busy':
      message = '当前服务繁忙，请稍后重试。';
      break;
    case 'model-unavailable':
      message = '实时生成服务暂不可用，可查看本次已召回的来源。';
      break;
    case 'model-timeout':
      message = '模型生成超时，请稍后重试。';
      break;
    case 'provider-error':
      message = '模型服务暂时未能完成请求，请稍后重试。';
      break;
    case 'generation-truncated':
      message = '模型输出超过长度限制，本次未展示不完整卡片。请缩小问题范围。';
      break;
    case 'generation-refused':
      message = '模型未生成可展示的知识卡，请调整问题。';
      break;
    case 'invalid-model-output':
      message = '模型输出未通过结构或来源检查，本次未展示知识卡。';
      break;
    case 'question-too-long':
      message = '问题最多 1000 个字符，请缩短问题。';
      break;
    case 'request-too-large':
      message = '提交内容过大，请缩短问题。';
      break;
    case 'request-timeout':
      message = '读取问题超时，请重新提交。';
      break;
    case 'request-cancelled':
      message = '本次请求已取消。';
      break;
    case 'unsupported-content-type':
    case 'invalid-request':
      message = '服务无法读取本次问题，请重新提交。';
      break;
    default:
      message =
        httpStatus === 429
          ? '提问过于频繁，请稍后重试。'
          : httpStatus === 403
            ? '当前页面无法调用问答服务，请从项目网页重试。'
            : '问答服务暂时无法完成请求，请稍后重试。';
  }
  return `${message}（HTTP ${httpStatus}）`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value !== 'string')
    throw new ResponseProblem('服务返回的运行记录不完整，请重试。');
  return value;
}

function readNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ResponseProblem('服务返回的运行记录不完整，请重试。');
  }
  return value;
}

/** Serialized cards have no brand: validate evidence and re-enter the real gate. */
function readRun(value: unknown, question: string, httpStatus: number): Run {
  if (!isObject(value))
    throw new ResponseProblem('服务返回的结果格式不正确，请重试。');
  if (value['question'] !== question) {
    throw new ResponseProblem(
      '返回结果与本次提问不一致，本次结果未展示。请重新提交。',
    );
  }
  const status = value['status'];
  if (
    status !== 'complete' &&
    status !== 'incomplete' &&
    status !== 'invalid' &&
    status !== 'error'
  ) {
    throw new ResponseProblem('服务返回了无法识别的状态，请重试。');
  }
  const rawCards = value['cards'];
  const rawEvidence = value['evidence'];
  if (!Array.isArray(rawCards) || !Array.isArray(rawEvidence)) {
    throw new ResponseProblem('服务返回的卡片或来源格式不正确，请重试。');
  }
  if (status === 'complete' && rawCards.length === 0) {
    throw new ResponseProblem('服务未返回知识卡，请调整问题后重试。');
  }
  if (
    status === 'incomplete' &&
    value['incompleteReason'] !== 'missing' &&
    value['incompleteReason'] !== 'conflicting'
  ) {
    throw new ResponseProblem('服务未说明依据不足的原因，本次结果未展示。');
  }
  const evidence = rawEvidence.map((candidate: unknown) => {
    const parsed = Evidence.safeParse(candidate);
    if (
      !parsed.success ||
      (parsed.data.url && !/^https?:\/\//i.test(parsed.data.url))
    ) {
      throw new ResponseProblem('来源数据未通过检查，本次结果未展示。');
    }
    return parsed.data;
  });
  const ids = new Set(evidence.map((item) => item.id));
  if (ids.size !== evidence.length)
    throw new ResponseProblem('来源编号重复，本次结果未展示。');
  const provenance = readProvenance(value['provenance']);
  if (
    !Number.isInteger(provenance.retrievedCount) ||
    provenance.retrievedCount !== evidence.length ||
    !Number.isInteger(provenance.indexedChunkCount) ||
    provenance.indexedChunkCount < evidence.length
  ) {
    throw new ResponseProblem('召回段落数量与来源记录不一致，本次结果未展示。');
  }
  const checked = gate(rawCards, evidence);
  // Source-only cards carry identifiers rather than grounded fields, so resolve
  // their identifiers explicitly as well before displaying them.
  const cards = checked.cards.filter(
    (card) =>
      card.type !== 'evidence' || card.evidenceIds.every((id) => ids.has(id)),
  );
  const timing = readTiming(value['timing']);
  const usage = readUsage(value['usage']);
  return {
    status,
    evidence,
    result: { cards, failures: checked.failures },
    rejectedCount: rawCards.length - cards.length,
    provenance,
    timing,
    usage,
    message:
      status === 'error' || status === 'invalid'
        ? failureMessage(value['code'], httpStatus)
        : status === 'incomplete'
          ? value['incompleteReason'] === 'conflicting'
            ? cards.length > 0
              ? '检索来源存在分歧，知识卡仅展示可支持的部分。'
              : '检索来源存在分歧，本次未生成知识卡。'
            : evidence.length === 0 &&
                timing.generationMs === 0 &&
                usage === null
              ? '当前语料没有检索到匹配片段，未调用模型。请尝试具体技术名称或英文关键词。'
              : cards.length > 0
                ? '当前检索证据不足，知识卡仅展示可支持的部分。'
                : '当前检索证据不足，本次未生成知识卡。'
          : undefined,
    failureCode: typeof value['code'] === 'string' ? value['code'] : undefined,
  };
}

function readProvenance(value: unknown): LiveCardsProvenance {
  if (
    !isObject(value) ||
    value['retrieval'] !== 'lexical-bm25' ||
    value['validation'] !== 'schema-and-citation-checks' ||
    value['thinking'] !== 'disabled' ||
    value['generationVersion'] !== 'live-cards-4' ||
    typeof value['schemaEnforced'] !== 'boolean' ||
    (value['queryExpansion'] !== 'technical-terms-v1' &&
      value['queryExpansion'] !== 'none')
  ) {
    throw new ResponseProblem('服务返回的来源记录不完整，请重试。');
  }
  return {
    corpusVersion: readString(value['corpusVersion']),
    retrieval: value['retrieval'],
    retrievalQuery: readString(value['retrievalQuery']),
    queryExpansion: value['queryExpansion'],
    retrievedCount: readNumber(value['retrievedCount']),
    indexedChunkCount: readNumber(value['indexedChunkCount']),
    profileId: readString(value['profileId']),
    model: readString(value['model']),
    promptVersion: readString(value['promptVersion']),
    schemaEnforced: value['schemaEnforced'],
    thinking: value['thinking'],
    generationVersion: value['generationVersion'],
    generatedAt: readString(value['generatedAt']),
    validation: value['validation'],
  };
}

function readTiming(value: unknown): LiveCardsTiming {
  if (!isObject(value))
    throw new ResponseProblem('服务未提供本次耗时，请重试。');
  return {
    retrievalMs: readNumber(value['retrievalMs']),
    generationMs: readNumber(value['generationMs']),
    validationMs: readNumber(value['validationMs']),
    totalMs: readNumber(value['totalMs']),
  };
}

function readUsage(value: unknown): LiveCardsUsage | null {
  if (value === null) return null;
  if (!isObject(value))
    throw new ResponseProblem('服务返回的用量记录不完整，请重试。');
  const count = (field: string) =>
    value[field] === null ? null : readNumber(value[field]);
  return {
    inputTokens: count('inputTokens'),
    outputTokens: count('outputTokens'),
    cacheCreationInputTokens: count('cacheCreationInputTokens'),
    cacheReadInputTokens: count('cacheReadInputTokens'),
  };
}

function milliseconds(value: number): string {
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(2)} s`;
}

/** A static preview can supply the deployed API URL; the app uses same-origin. */
export function LiveAskPanel({
  endpoint = '/api/cards',
}: {
  endpoint?: string;
}) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const active = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(
    () => () => {
      revision.current += 1;
      active.current?.abort();
    },
    [],
  );

  async function ask(value: string) {
    const trimmed = value.trim();
    if (active.current || trimmed.length === 0 || trimmed.length > 1000) return;
    const controller = new AbortController();
    active.current = controller;
    const requestRevision = ++revision.current;
    setPending(true);
    setAsked(trimmed);
    setRun(null);
    setNotice(null);
    let onAbort: () => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(
          new ResponseProblem(
            controller.signal.reason === 'client-deadline'
              ? '等待超过 75 秒，已停止等待。服务端可能已开始生成，暂时无法确认本次用量；没有自动重试。'
              : '已取消等待，本次结果不会显示。服务端可能已开始生成。',
          ),
        );
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timer = setTimeout(
      () => controller.abort('client-deadline'),
      CLIENT_DEADLINE_MS,
    );
    try {
      const operation = async () => {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: trimmed }),
          signal: controller.signal,
        });
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new ResponseProblem(
            response.ok
              ? '服务未返回可读取的 JSON，本次结果未展示。请稍后重试。'
              : failureMessage(undefined, response.status),
          );
        }
        return { response, body };
      };
      const { response, body } = await Promise.race([operation(), stopped]);
      if (requestRevision !== revision.current) return;
      // Full generation failures still carry real sources, timing and usage.
      // Rate/concurrency guards have only a small error envelope.
      if (
        !response.ok &&
        (!isObject(body) ||
          (body['status'] !== 'error' && body['status'] !== 'invalid') ||
          !Array.isArray(body['evidence']) ||
          !isObject(body['provenance']))
      ) {
        throw new ResponseProblem(
          failureMessage(
            isObject(body) ? body['code'] : undefined,
            response.status,
          ),
        );
      }
      setRun(readRun(body, trimmed, response.status));
    } catch (error) {
      if (requestRevision !== revision.current) return;
      setNotice(
        error instanceof ResponseProblem
          ? error.message
          : '网络连接或响应读取失败，请检查网络后重试；暂时无法确认本次模型用量。',
      );
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      if (requestRevision === revision.current) {
        active.current = null;
        setPending(false);
      }
    }
  }

  function cancel() {
    revision.current += 1;
    active.current?.abort();
    active.current = null;
    setPending(false);
    setNotice('已取消等待，本次结果不会显示。服务端可能已开始生成。');
  }

  return (
    <div className="live-ask-panel">
      <section className="live-ask-composer" aria-label="向语料提问">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor="live-question">你的问题</label>
          <textarea
            id="live-question"
            value={question}
            maxLength={1000}
            rows={3}
            placeholder="例如：为什么重排不能提高召回率？"
            disabled={pending}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void ask(question);
              }
            }}
          />
          <div className="live-ask-submit-row">
            <span>
              Enter 提问 · Shift + Enter 换行{' '}
              <small>{question.length}/1000</small>
            </span>
            {pending ? (
              <button
                type="button"
                className="delivery-button"
                onClick={cancel}
              >
                取消等待
              </button>
            ) : (
              <button
                type="submit"
                className="delivery-button delivery-button-dark"
                disabled={!question.trim()}
              >
                生成知识卡 <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        </form>
        <p className="live-ask-language">
          当前知识语料以英文撰写，涵盖 RAG、检索与 Generative
          UI。支持常见中文技术术语映射；匹配不到依据时会提示不足。也可以直接用英文提问。
        </p>
      </section>
      <div className="live-ask-suggestions" aria-label="示例问题">
        <span>试着问</span>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={pending}
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
      <div className="live-ask-pipeline" aria-label="回答流程">
        <span>
          <b>01</b> 检索真实段落
        </span>
        <i aria-hidden="true">→</i>
        <span>
          <b>02</b> 模型生成卡片
        </span>
        <i aria-hidden="true">→</i>
        <span>
          <b>03</b> 检查结构与引用
        </span>
      </div>
      <section
        className="live-ask-results"
        aria-label="本次回答"
        aria-busy={pending}
      >
        {asked ? (
          <p className="live-ask-asked">
            <span>本次提问</span>
            {asked}
          </p>
        ) : null}
        {pending ? (
          <div className="live-ask-waiting" aria-live="polite">
            <span className="live-ask-pulse" aria-hidden="true" />
            <div>
              <strong>正在检索语料并生成知识卡</strong>
              <p>等待真实服务返回，完成后显示本次来源和耗时。</p>
            </div>
          </div>
        ) : null}
        {notice ? (
          <p role="alert" className="live-ask-notice">
            {notice}
          </p>
        ) : null}
        {run ? <RunResult key={run.provenance.generatedAt} run={run} /> : null}
        {!asked ? (
          <div className="live-ask-empty">
            <span className="live-ask-empty-mark" aria-hidden="true">
              ↗
            </span>
            <h2>从一个具体问题开始</h2>
            <p>
              提交后，这里会显示本次检索与模型生成的结果。卡片旁的引用标记可以打开原始段落。
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RunResult({ run }: { run: Run }) {
  const byId = new Map(run.evidence.map((item) => [item.id, item]));
  const resolve = (id: string) => byId.get(id);
  const canRender = run.status === 'complete' || run.status === 'incomplete';
  const cards = canRender ? run.result.cards : [];
  const modelWasSkipped =
    (run.status === 'incomplete' &&
      run.evidence.length === 0 &&
      run.timing.generationMs === 0 &&
      run.usage === null) ||
    (run.failureCode === 'model-unavailable' && run.timing.generationMs === 0);
  return (
    <SourceDrawerProvider resolve={resolve}>
      <div className="live-ask-result-head" aria-live="polite">
        <h2>
          {cards.length
            ? '本次生成的知识卡'
            : run.status === 'incomplete'
              ? '语料依据不足'
              : '本次未生成可展示的知识卡'}
        </h2>
        <span>
          {cards.length} 张卡片 · {run.evidence.length} 段来源 · 服务耗时{' '}
          {milliseconds(run.timing.totalMs)}
        </span>
      </div>
      {run.status === 'incomplete' ? (
        <p className="live-ask-notice">
          {run.message ||
            '检索到的语料不足以支持完整回答，请缩小问题范围或换用更具体的术语。'}
        </p>
      ) : null}
      {run.status === 'invalid' || run.status === 'error' ? (
        <p className="live-ask-notice" role="alert">
          {run.message || '本次生成未通过检查，请稍后重试。'}
        </p>
      ) : null}
      {run.rejectedCount > 0 ? (
        <p className="live-ask-notice" role="alert">
          {run.rejectedCount} 张卡片未通过本页的结构或来源检查，已拒绝展示。
        </p>
      ) : null}
      {canRender && cards.length === 0 && run.status !== 'incomplete' ? (
        <p className="live-ask-notice">
          本次结果中没有同时满足卡片结构与来源要求的内容。请调整问题后重试。
        </p>
      ) : null}
      {cards.length > 0 ? (
        <p className="live-ask-validation">
          卡片通过结构与引用检查；生成内容仍可能有解释错误。点击文字后的引用标记核对原文。
        </p>
      ) : null}
      <div className="live-ask-cards">
        {cards.map((card, index) => (
          <KnowledgeCard
            key={`${card.id}-${index}`}
            card={card}
            resolveEvidence={resolve}
          />
        ))}
      </div>
      <details className="live-ask-record">
        <summary>
          本次运行与检索来源 <span>{run.evidence.length} 段</span>
        </summary>
        <div className="live-ask-record-content">
          <dl>
            <div>
              <dt>模型</dt>
              <dd>{run.provenance.model}</dd>
            </div>
            <div>
              <dt>网页生成配置</dt>
              <dd>{run.provenance.generationVersion} · 思考模式关闭</dd>
            </div>
            <div>
              <dt>知识语料</dt>
              <dd>
                {run.provenance.corpusVersion} · 共{' '}
                {run.provenance.indexedChunkCount} 段
              </dd>
            </div>
            <div>
              <dt>实际检索词</dt>
              <dd>{run.provenance.retrievalQuery}</dd>
            </div>
            <div>
              <dt>中文术语映射</dt>
              <dd>
                {run.provenance.queryExpansion === 'technical-terms-v1'
                  ? '已使用常见技术术语映射'
                  : '未使用'}
              </dd>
            </div>
            <div>
              <dt>本次耗时</dt>
              <dd>
                检索 {milliseconds(run.timing.retrievalMs)} · 生成{' '}
                {milliseconds(run.timing.generationMs)} · 检查{' '}
                {milliseconds(run.timing.validationMs)}
              </dd>
            </div>
            <div>
              <dt>用量</dt>
              <dd>
                {run.usage
                  ? `未缓存输入 ${run.usage.inputTokens ?? '未提供'} tokens · 输出 ${run.usage.outputTokens ?? '未提供'} tokens · 缓存读取 ${run.usage.cacheReadInputTokens ?? '未提供'} tokens · 缓存写入 ${run.usage.cacheCreationInputTokens ?? '未提供'} tokens`
                  : modelWasSkipped
                    ? '本次未调用模型，无本次模型用量。'
                    : '服务未返回用量，不能据此判断为零消耗。'}
              </dd>
            </div>
            <div>
              <dt>检索与验证</dt>
              <dd>
                BM25 文字检索 · 结构、引用编号与摘录检查 · 本页拒绝{' '}
                {run.rejectedCount} 张
              </dd>
            </div>
          </dl>
          <ol className="live-ask-passages">
            {run.evidence.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.documentTitle}</strong>
                  <span>BM25 {item.retrievalScore.toFixed(3)}</span>
                </div>
                {item.section ? <small>{item.section}</small> : null}
                <code>{item.id}</code>
                <blockquote>{item.text}</blockquote>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    查看来源 ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </SourceDrawerProvider>
  );
}
