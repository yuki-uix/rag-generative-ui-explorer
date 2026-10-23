import { LiveAskPanel } from '@/components/live-ask-panel';
import { SiteFooter, SiteNav } from '@/components/review/site-nav';
import '../live-ask.css';

/** Live card delivery is separate from the preserved Markdown/F5 baseline. */
export default function AskPage({ endpoint }: { endpoint?: string } = {}) {
  return (
    <div className="delivery-site live-ask-page" lang="zh-CN">
      <SiteNav active="ask" />
      <main className="delivery-main live-ask-main">
        <header className="live-ask-heading">
          <p className="delivery-eyebrow">
            <span /> LIVE QUESTIONS · REAL EVIDENCE
          </p>
          <h1>向知识语料提问。</h1>
          <p>
            从实际检索到的段落生成知识卡，点击卡片里的引用标记，查看它依据的原文。
          </p>
        </header>
        <LiveAskPanel endpoint={endpoint} />
      </main>
      <SiteFooter />
    </div>
  );
}
