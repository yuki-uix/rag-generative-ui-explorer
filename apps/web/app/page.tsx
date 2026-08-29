'use client';

import { useState } from 'react';
import {
  ArrowRight, ArrowUp, BookOpen, Check, ChevronRight, CircleDot,
  Copy, ExternalLink, GitCompareArrows, History, Layers3, Library,
  MessageCircle, Plus, Search, Sparkles, WandSparkles, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type Demo = 'evidence' | 'rerank' | 'levels';

const prompts: Array<{ label: string; demo: Demo }> = [
  { label: 'Reranking 有什么用？', demo: 'rerank' },
  { label: 'Generative UI 有哪些层级？', demo: 'levels' },
  { label: '卡片如何保持证据可追溯？', demo: 'evidence' },
];

const sourceData = [
  { id: '1', title: 'Choosing a UI from knowledge structure', section: 'Structure before presentation', note: 'Repository note · original analysis', excerpt: 'Presentation follows the structure that retrieved evidence can actually support.' },
  { id: '2', title: 'Evidence-aware knowledge cards', section: 'Field-level support', note: 'Repository note · 2 supporting sources', excerpt: 'Each factual field carries the identifiers of the passages that support it.' },
  { id: '3', title: 'Retrieval metrics', section: 'Recall@K', note: 'Repository note · 3 supporting sources', excerpt: 'If the evidence is absent from the retrieved set, no downstream stage can recover it.' },
];

function Cite({ n }: { n: string }) {
  return <span className="cite" aria-label={`来源 ${n}`}>{n}</span>;
}

function EvidenceAnswer() {
  return (
    <>
      <p className="answer-lead">可以把它理解成一条很短的链路：<strong>先找证据，再识别结构，最后选择界面。</strong> UI 不应该脱离证据自由发挥。</p>
      <article className="grow-card mint-card">
        <div className="card-kicker"><WandSparkles /> 机制卡片 <span>3 个字段已验证</span></div>
        <h2>检索结果如何“长成”知识卡片？</h2>
        <div className="tiny-flow">
          <div><i>1</i><strong>Retrieve</strong><span>召回片段</span></div>
          <ArrowRight />
          <div><i>2</i><strong>Read shape</strong><span>识别知识结构</span></div>
          <ArrowRight />
          <div className="flow-focus"><i>3</i><strong>Compose</strong><span>选择最小卡片</span></div>
        </div>
        <p className="card-note">模型输出受 Schema 约束的 card spec，而不是任意 HTML。<Cite n="1" /><Cite n="2" /></p>
      </article>
      <div className="mini-cards">
        <article className="grow-card peach-card">
          <div className="card-kicker"><BookOpen /> 小定义</div>
          <h3>Evidence-aware</h3>
          <p>每个事实字段都知道“我从哪来”，引用跟着字段走。<Cite n="2" /></p>
        </article>
        <article className="grow-card blue-card">
          <div className="card-kicker"><CircleDot /> 回退规则</div>
          <h3>没有结构，不硬生成</h3>
          <p>证据不足时返回简洁文字，或者明确说不知道。<Cite n="3" /></p>
        </article>
      </div>
    </>
  );
}

function RerankAnswer() {
  const before = [['Chunk A', '0.71'], ['Chunk B', '0.69'], ['Chunk C', '0.67']];
  const after = [['Chunk C', '0.93'], ['Chunk A', '0.74'], ['Chunk B', '0.42']];
  return (
    <>
      <p className="answer-lead">召回负责<strong>尽量不漏</strong>，reranking 负责把最能回答问题的片段推到前面。它改变顺序，但不会找回候选集里本来就没有的证据。<Cite n="3" /></p>
      <article className="grow-card lilac-card">
        <div className="card-kicker"><GitCompareArrows /> 对比卡片 <span>候选集不变</span></div>
        <h2>同一组结果，重排前后</h2>
        <div className="rank-compare">
          <div><small>召回排序</small>{before.map(([name, score], i) => <div className="rank-row" key={name}><i>{i + 1}</i><strong>{name}</strong><span>{score}</span></div>)}</div>
          <ArrowRight className="rank-arrow" />
          <div><small>相关性重排</small>{after.map(([name, score], i) => <div className={`rank-row ${i === 0 ? 'winner' : ''}`} key={name}><i>{i + 1}</i><strong>{name}</strong><span>{score}</span></div>)}</div>
        </div>
        <p className="card-note">如果正确证据没有被召回，reranker 无法凭空补回来。</p>
      </article>
    </>
  );
}

function LevelsAnswer() {
  return (
    <>
      <p className="answer-lead">Generative UI 不是“生成或不生成”的二选一。越往后，模型拥有的界面决定权越大，同时验证成本也越高。</p>
      <article className="grow-card sunshine-card">
        <div className="card-kicker"><Layers3 /> 层级卡片 <span>从低风险到高自由度</span></div>
        <h2>四种常见生成层级</h2>
        <div className="level-stack">
          <div><i>01</i><span><strong>内容生成</strong><small>固定 UI，模型只填内容</small></span><em>最稳</em></div>
          <div><i>02</i><span><strong>组件选择</strong><small>从受控组件库中组合</small></span><em>MVP</em></div>
          <div><i>03</i><span><strong>Schema UI</strong><small>输出声明式界面结构</small></span><em>灵活</em></div>
          <div><i>04</i><span><strong>代码生成</strong><small>直接生成 HTML / React</small></span><em>高风险</em></div>
        </div>
        <p className="card-note">这个项目选择第 2 层：模型选卡片，renderer 掌握视觉、行为和可访问性。<Cite n="1" /></p>
      </article>
    </>
  );
}

export default function Home() {
  const [query, setQuery] = useState('如何让 RAG 的检索结果驱动动态知识卡片？');
  const [submitted, setSubmitted] = useState(query);
  const [demo, setDemo] = useState<Demo>('evidence');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [compare, setCompare] = useState(false);

  function ask(next?: string, nextDemo: Demo = 'evidence') {
    const text = next ?? query;
    if (!text.trim()) return;
    setQuery(text);
    setSubmitted(text);
    setDemo(nextDemo);
    setExpanded(false);
    setCompare(false);
    setLoading(true);
    window.setTimeout(() => setLoading(false), 900);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="light-header">
        <a className="light-brand" href="#top"><span><Sparkles /></span>Lattice <em>beta</em></a>
        <div className="corpus-pill"><i /> RAG × Generative UI · 36 notes</div>
        <nav aria-label="工具">
          <Button variant="ghost" size="icon-sm" aria-label="搜索"><Search /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="历史对话"><History /></Button>
          <div className="tiny-avatar">Y</div>
        </nav>
      </header>

      <section className="chat" id="top">
        <div className="hello">
          <div className="hello-spark"><Sparkles /></div>
          <p>嗨，我是 Lattice</p>
          <h1>一起把知识聊明白。</h1>
          <span>我会从知识库找证据，并让合适的界面自然出现在对话里。</span>
        </div>

        <div className="turn user-turn">
          <div className="user-bubble">{submitted}</div>
          <div className="turn-avatar user-avatar">你</div>
        </div>

        <div className="turn assistant-turn">
          <div className="turn-avatar bot-avatar"><Sparkles /></div>
          <div className="assistant-content">
            <div className="answer-meta"><span><i /> 找到 3 条相关证据</span><button>为什么是这些？ <ChevronRight /></button></div>
            {loading ? (
              <div className="thinking" aria-live="polite"><div><span /><span /><span /></div><p>正在读证据的结构…</p></div>
            ) : (
              <div className="generated-answer">
                {demo === 'evidence' && <EvidenceAnswer />}
                {demo === 'rerank' && <RerankAnswer />}
                {demo === 'levels' && <LevelsAnswer />}

                {expanded && (
                  <div className="follow-bubble">
                    <span><Sparkles /> 再展开一点</span>
                    <p>把检索和渲染分开很重要：retriever 只返回 evidence，planner 只返回经过验证的 card spec，renderer 才真正决定布局和交互。这样每一层都可以单独测试。</p>
                  </div>
                )}

                {compare && (
                  <article className="grow-card compare-card">
                    <button className="card-close" onClick={() => setCompare(false)} aria-label="关闭对比"><X /></button>
                    <div className="card-kicker"><GitCompareArrows /> 即时对比</div>
                    <h2>动态卡片 vs. 普通 Markdown</h2>
                    <div className="versus-grid"><div><strong>动态卡片</strong><span>结构清晰、可操作</span><small>更适合比较与流程</small></div><div><strong>Markdown</strong><span>自然、稳定、低成本</span><small>更适合简单解释</small></div></div>
                  </article>
                )}

                <div className="conversation-actions">
                  <Dialog>
                    <DialogTrigger render={<Button variant="ghost" size="sm" />}><BookOpen /> 3 个来源</DialogTrigger>
                    <DialogContent className="source-sheet">
                      <DialogHeader><div className="dialog-mark"><Library /></div><DialogTitle>这段回答从哪里来？</DialogTitle><DialogDescription>来源贴着它支持的事实，而不是统一堆在回答末尾。</DialogDescription></DialogHeader>
                      <div className="source-list">
                        {sourceData.map((source) => <article className="source-row" key={source.id}><div className="source-id">{source.id}</div><div><strong>{source.title}</strong><span>{source.section} · {source.note}</span><p>“{source.excerpt}”</p><button>打开知识笔记 <ExternalLink /></button></div></article>)}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}><Plus /> {expanded ? '收起解释' : '再展开一点'}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setCompare(!compare)}><GitCompareArrows /> {compare ? '收起对比' : '生成对比'}</Button>
                  <Button variant="ghost" size="icon-sm" className="copy-button" aria-label="复制回答"><Copy /></Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="composer-wrap">
        <div className="prompt-chips">{prompts.map((prompt) => <button key={prompt.label} onClick={() => ask(prompt.label, prompt.demo)}>{prompt.label}</button>)}</div>
        <div className="composer">
          <div className="composer-icon"><MessageCircle /></div>
          <Textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="问一个关于 RAG 或 Generative UI 的问题…" aria-label="输入问题" />
          <Button size="icon-lg" className="send-button" onClick={() => ask()} disabled={!query.trim() || loading} aria-label="发送"><ArrowUp /></Button>
        </div>
        <p>原型使用模拟证据 · 回答可能不完整，请查看来源</p>
      </div>
    </main>
  );
}
