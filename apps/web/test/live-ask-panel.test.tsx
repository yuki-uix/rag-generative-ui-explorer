// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Evidence, KnowledgeCard } from '@rgux/contracts';
import type { LiveCardsResponse } from '../lib/live-cards-types.js';
import { LiveAskPanel } from '../components/live-ask-panel.js';

const SOURCE: Evidence = {
  id: 'rag/reranking#limits#0-1234abcd',
  documentId: 'rag/reranking',
  documentTitle: 'Reranking',
  section: 'Limits',
  text: 'Reranking cannot raise recall over its candidate set. It changes the order of the retrieved candidates.',
  retrievalScore: 4.125,
  metadata: {},
  url: 'https://example.com/reranking',
};
const CARD: KnowledgeCard = {
  id: 'generated-definition',
  type: 'definition',
  title: '重排与召回',
  definition: {
    text: '重排不能找回候选集之外的文档。',
    mode: 'summarized',
    evidenceIds: [SOURCE.id],
  },
  keyPoints: [
    {
      text: 'Reranking cannot raise recall over its candidate set.',
      mode: 'extractive',
      evidenceIds: [SOURCE.id],
    },
  ],
};
function answer(question = '为什么重排不能提高召回率？'): LiveCardsResponse {
  return {
    status: 'complete',
    question,
    cards: [CARD],
    evidence: [SOURCE],
    provenance: {
      corpusVersion: 'test-corpus-a1',
      retrieval: 'lexical-bm25',
      retrievalQuery: 'reranking recall',
      queryExpansion: 'technical-terms-v1',
      retrievedCount: 1,
      indexedChunkCount: 120,
      model: 'test-live-model',
      profileId: 'test-profile',
      promptVersion: 'test-prompt-v1',
      schemaEnforced: true,
      thinking: 'disabled',
      generationVersion: 'live-cards-5',
      generatedAt: '2026-10-22T06:30:00Z',
      validation: 'schema-and-citation-checks',
    },
    timing: {
      retrievalMs: 12,
      generationMs: 1800,
      validationMs: 4,
      totalMs: 1816,
    },
    usage: {
      inputTokens: 120,
      outputTokens: 85,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
  };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function submit(question = '为什么重排不能提高召回率？') {
  fireEvent.change(screen.getByRole('textbox', { name: '你的问题' }), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: /生成知识卡/ }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('live retrieval and card delivery', () => {
  it('submits via keyboard to the configured API and opens the actual retrieved paragraph', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(answer()));
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(
      <LiveAskPanel endpoint="https://live.example/api/cards" />,
    );
    expect(container.querySelector('[data-card-type]')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /生成知识卡/ })
        .hasAttribute('disabled'),
    ).toBe(true);
    const input = screen.getByRole('textbox', { name: '你的问题' });
    fireEvent.change(input, {
      target: { value: '  为什么重排不能提高召回率？  ' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('重排与召回');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://live.example/api/cards');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual(
      {
        question: '为什么重排不能提高召回率？',
      },
    );
    expect(screen.getByText(/服务耗时 1.82 s/)).toBeDefined();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: (name) => name.includes(SOURCE.id),
      })[0]!,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('q')?.textContent).toBe(SOURCE.text);
    expect(
      within(dialog)
        .getByRole('link', { name: 'Open source' })
        .getAttribute('href'),
    ).toBe(SOURCE.url);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('本次运行与检索来源'));
    expect(screen.getByText('reranking recall')).toBeDefined();
    expect(screen.getByText('live-cards-5 · 思考模式关闭')).toBeDefined();
    expect(
      screen.getByText(
        /未缓存输入 120 tokens · 输出 85 tokens · 缓存读取 0 tokens · 缓存写入 0 tokens/,
      ),
    ).toBeDefined();
  });

  it('gates serialized cards independently and refuses unknown types, invented references and false extracts', async () => {
    const wire = answer();
    const badId = 'rag/missing#body#0-00000000';
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...wire,
          cards: [
            CARD,
            {
              ...CARD,
              id: 'unsupported',
              type: 'timeline',
              title: '不应出现的时间线',
            },
            {
              ...CARD,
              id: 'bad-reference',
              title: '不应出现的引用',
              definition: { ...CARD.definition, evidenceIds: [badId] },
            },
            {
              ...CARD,
              id: 'false-extract',
              title: '不应出现的摘录',
              definition: {
                text: 'This passage never said these words.',
                mode: 'extractive',
                evidenceIds: [SOURCE.id],
              },
            },
            {
              id: 'bad-evidence',
              type: 'evidence',
              title: '不应出现的来源',
              evidenceIds: [badId],
            },
          ],
        }),
      ),
    );
    const { container } = render(<LiveAskPanel />);
    submit();
    await screen.findByText('重排与召回');
    expect(container.querySelectorAll('[data-card-type]')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain('4 张卡片未通过');
    expect(screen.queryByText(/不应出现的/)).toBeNull();
  });

  it('never renders a valid-looking card from an invalid envelope or without its evidence', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          ...answer(),
          status: 'invalid',
          code: 'invalid-model-output',
          message: '生成结果未通过服务端检查。',
        }),
      )
      .mockResolvedValueOnce(
        response({
          ...answer('reranking recall'),
          evidence: [],
          provenance: { ...answer().provenance, retrievedCount: 0 },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<LiveAskPanel />);
    submit();
    await screen.findByText(/模型输出未通过结构或来源检查/);
    expect(container.querySelector('[data-card-type]')).toBeNull();
    submit('reranking recall');
    await screen.findByText(/1 张卡片未通过/);
    expect(container.querySelector('[data-card-type]')).toBeNull();
  });

  it('shows a readable rate-limit error and allows a real retry after a failed request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          {
            status: 'error',
            code: 'rate-limited',
            message: '请求较多，请稍后重试。',
          },
          429,
        ),
      )
      .mockRejectedValueOnce(new Error('网络暂时不可用。'));
    vi.stubGlobal('fetch', fetcher);
    render(<LiveAskPanel />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe(
      '提问过于频繁，请稍后重试。（HTTP 429）',
    );
    submit('try again');
    expect((await screen.findByRole('alert')).textContent).toContain(
      '网络连接或响应读取失败',
    );
    expect(screen.queryByText('网络暂时不可用。')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('重排与召回')).toBeNull();
  });

  it('shows insufficient evidence without replacing it with sample cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...answer('今天深圳天气怎样？'),
          status: 'incomplete',
          incompleteReason: 'missing',
          cards: [],
          evidence: [],
          provenance: { ...answer().provenance, retrievedCount: 0 },
          usage: null,
          timing: {
            retrievalMs: 12,
            generationMs: 0,
            validationMs: 0,
            totalMs: 12,
          },
          message: '知识库没有支持这个问题的段落。',
        }),
      ),
    );
    const { container } = render(<LiveAskPanel />);
    submit('今天深圳天气怎样？');
    await screen.findByText('语料依据不足');
    expect(
      screen.getByText(/当前语料没有检索到匹配片段，未调用模型/),
    ).toBeDefined();
    fireEvent.click(screen.getByText('本次运行与检索来源'));
    expect(screen.getByText('本次未调用模型，无本次模型用量。')).toBeDefined();
    expect(container.querySelector('[data-card-type]')).toBeNull();
  });

  it('cancels waiting, prevents duplicate submits and ignores a late cancelled result', async () => {
    let finishFirst: (value: Response) => void = () => {
      throw new Error('not started');
    };
    const waiting = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(waiting)
      .mockResolvedValueOnce(
        response({
          ...answer('different question'),
          cards: [{ ...CARD, title: '新的回答' }],
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const { unmount } = render(<LiveAskPanel />);
    submit();
    expect(screen.getByText('正在检索语料并生成知识卡')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const signal = fetcher.mock.calls[0]![1]?.signal;
    fireEvent.click(screen.getByRole('button', { name: '取消等待' }));
    expect(signal?.aborted).toBe(true);
    submit('different question');
    await screen.findByText('新的回答');
    await act(async () => {
      finishFirst(response(answer()));
    });
    expect(screen.queryByText('重排与召回')).toBeNull();
    expect(screen.getByText('新的回答')).toBeDefined();
    unmount();
  });

  it('rejects a response for another question rather than attaching it to the current question', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response(answer('a different question'))),
    );
    const { container } = render(<LiveAskPanel />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      '与本次提问不一致',
    );
    expect(container.querySelector('[data-card-type]')).toBeNull();
  });

  it('keeps sources, time and all token counters from a failed generation without showing raw error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response(
          {
            ...answer(),
            status: 'invalid',
            code: 'invalid-model-output',
            cards: [],
            message: '<html>provider-private-error</html>',
            usage: {
              inputTokens: 120,
              outputTokens: 85,
              cacheCreationInputTokens: 11,
              cacheReadInputTokens: 30,
            },
          },
          422,
        ),
      ),
    );
    const { container } = render(<LiveAskPanel />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'HTTP 422',
    );
    expect(screen.queryByText(/provider-private-error/)).toBeNull();
    expect(container.querySelector('[data-card-type]')).toBeNull();
    expect(screen.getByText(/服务耗时 1.82 s/)).toBeDefined();
    fireEvent.click(screen.getByText('本次运行与检索来源'));
    expect(
      screen.getByText(/缓存读取 30 tokens · 缓存写入 11 tokens/),
    ).toBeDefined();
    expect(screen.getByText(SOURCE.text)).toBeDefined();
  });

  it('bounds a hanging response body even when the transport ignores AbortSignal', async () => {
    vi.useFakeTimers();
    const hanging = new Response(
      new ReadableStream<Uint8Array>({ start() {} }),
      { headers: { 'content-type': 'application/json' } },
    );
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(hanging);
    vi.stubGlobal('fetch', fetcher);
    render(<LiveAskPanel />);
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    expect(screen.getByRole('alert').textContent).toContain('等待超过 75 秒');
    expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(screen.queryByText('正在检索语料并生成知识卡')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /生成知识卡/ })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('rejects a provenance source count that disagrees with the passages actually returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...answer(),
          provenance: { ...answer().provenance, retrievedCount: 8 },
        }),
      ),
    );
    const { container } = render(<LiveAskPanel />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      '召回段落数量与来源记录不一致',
    );
    expect(container.querySelector('[data-card-type]')).toBeNull();
  });

  it('keeps unknown provider usage distinct from a skipped model and hides an HTML error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          response(
            {
              ...answer(),
              status: 'error',
              code: 'provider-error',
              cards: [],
              usage: null,
            },
            502,
          ),
        )
        .mockResolvedValueOnce(
          new Response('<html>proxy-debug-secret</html>', { status: 502 }),
        ),
    );
    render(<LiveAskPanel />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'HTTP 502',
    );
    fireEvent.click(screen.getByText('本次运行与检索来源'));
    expect(
      screen.getByText('服务未返回用量，不能据此判断为零消耗。'),
    ).toBeDefined();
    expect(screen.getByText(SOURCE.text)).toBeDefined();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'HTTP 502',
    );
    expect(screen.queryByText(/proxy-debug-secret/)).toBeNull();
  });

  it.each([
    ['missing', '当前检索证据不足，本次未生成知识卡。'],
    ['conflicting', '检索来源存在分歧，本次未生成知识卡。'],
  ])(
    'describes an empty %s answer without claiming partial cards are shown',
    async (reason, message) => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValue(
          response({
            ...answer(),
            status: 'incomplete',
            incompleteReason: reason,
            cards: [],
            message:
              'An arbitrary server message must not override the empty state.',
          }),
        ),
      );
      const { container } = render(<LiveAskPanel />);
      submit();
      expect(await screen.findByText(message)).toBeDefined();
      expect(screen.queryByText(/知识卡仅展示可支持的部分/)).toBeNull();
      expect(screen.queryByText(/未调用模型/)).toBeNull();
      expect(container.querySelector('[data-card-type]')).toBeNull();
      fireEvent.click(screen.getByText('本次运行与检索来源'));
      expect(screen.getByText(SOURCE.text)).toBeDefined();
    },
  );

  it('clears the client deadline after cancellation and unmounting pending requests', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockImplementation(() => new Promise<Response>(() => {})),
    );
    const { unmount } = render(<LiveAskPanel />);
    submit();
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '取消等待' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    expect(screen.getByRole('alert').textContent).toContain('已取消等待');
    expect(screen.getByRole('alert').textContent).not.toContain('超过 75 秒');
    submit();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts an older compatible generation revision and displays the revision actually served', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...answer(),
          provenance: {
            ...answer().provenance,
            generationVersion: 'live-cards-4',
          },
        }),
      ),
    );
    render(<LiveAskPanel />);
    submit();
    await screen.findByText('重排与召回');
    fireEvent.click(screen.getByText('本次运行与检索来源'));
    expect(screen.getByText('live-cards-4 · 思考模式关闭')).toBeDefined();
    expect(screen.queryByText('live-cards-5 · 思考模式关闭')).toBeNull();
  });

  it('rejects malformed generation provenance without weakening the card gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...answer(),
          provenance: {
            ...answer().provenance,
            generationVersion: 'live-cards-0<script>',
          },
        }),
      ),
    );
    const { container } = render(<LiveAskPanel />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      '来源记录不完整',
    );
    expect(container.querySelector('[data-card-type]')).toBeNull();
  });
});
