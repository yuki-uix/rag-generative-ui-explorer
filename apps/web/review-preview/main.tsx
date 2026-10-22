import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import {
  PROJECT_URL,
  SiteFooter,
  SiteNav,
  appHref,
} from '../components/review/site-nav';
import type { ImageReviewData } from '../lib/image-review-types';
import '../app/globals.css';

const ImageReview = lazy(async () => {
  const [{ ImageExperimentReview }, { default: data }] = await Promise.all([
    import('../components/review/image-experiment-review'),
    import('../fixtures/image-review.json'),
  ]);
  return {
    default: () => <ImageExperimentReview data={data as ImageReviewData} />,
  };
});
// The existing gallery resolves build-time evidence and gates fixtures using
// contracts. It does not import the corpus reader or the generation runtime.
const CardGalleryPage = lazy(() => import('../app/cards/page'));

type PreviewRoute = 'home' | 'cards' | 'images' | 'ask';
const titles: Record<PreviewRoute, string> = {
  home: 'RAG Explorer · 项目预览',
  cards: '知识卡 · RAG Explorer',
  images: '图片检索实验 · RAG Explorer',
  ask: '问答状态 · RAG Explorer',
};
function currentRoute(): PreviewRoute {
  const hash = window.location.hash.slice(1);
  return hash === 'cards' || hash === 'images' || hash === 'ask'
    ? hash
    : 'home';
}

function LoadingPage() {
  return (
    <main className="delivery-main">
      <output>正在打开页面…</output>
    </main>
  );
}

function AskStatus() {
  return (
    <main className="delivery-main" style={{ maxWidth: '850px' }}>
      <div className="delivery-eyebrow">问答链路 / 当前状态</div>
      <h1>实时问答需要运行服务器。</h1>
      <p className="review-notice">
        当前是 GitHub 静态预览，没有问答 API
        或模型密钥。此页说明已有实现和运行方式，无法在这里提交问题。
      </p>
      <h2>已经实现了什么？</h2>
      <p>
        服务器接收问题后，使用 BM25
        检索语料，将段落交给真实模型，再校验引用并流式返回 Markdown
        回答。知识卡页面目前展示固定示例，动态选卡的整体体验仍待整合与评估。
      </p>
      <p>
        <a
          href={`${PROJECT_URL}/blob/codex/image-retrieval/apps/web/app/api/ask/route.ts`}
          target="_blank"
          rel="noreferrer"
        >
          查看服务器问答实现 ↗
        </a>
        　
        <a
          href={`${PROJECT_URL}/blob/codex/image-retrieval/docs/ARCHITECTURE.md`}
          target="_blank"
          rel="noreferrer"
        >
          查看架构与部署说明 ↗
        </a>
      </p>
      <h2>如何在本地查看？</h2>
      <p>
        在克隆的仓库中运行以下命令，然后打开本地服务的 <code>/ask</code>
        。完整实时问答还需要按架构文档配置服务器端模型密钥。
      </p>
      <pre className="review-notice">
        pnpm install --frozen-lockfile{'\n'}pnpm web:dev
      </pre>
      <p>
        <a
          className="delivery-button delivery-button-dark"
          href={appHref('/cards')}
        >
          先体验知识卡 →
        </a>
        　<a href={appHref('/experiments/images')}>查看已完成的图片实验 →</a>
      </p>
    </main>
  );
}

function Preview() {
  const [route, setRoute] = useState<PreviewRoute>(currentRoute);
  useEffect(() => {
    const onHashChange = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    document.title = titles[route];
  }, [route]);

  if (route === 'home') return <Home />;
  if (route === 'images')
    return (
      <Suspense fallback={<LoadingPage />}>
        <ImageReview />
      </Suspense>
    );
  return (
    <div className="delivery-site" lang="zh-CN">
      <SiteNav active={route} />
      {route === 'cards' ? (
        <>
          <section
            className="delivery-main"
            style={{ paddingBottom: 0 }}
            aria-label="知识卡使用说明"
          >
            <p className="review-notice">
              从下面的五类知识卡开始：点击字段后的引用编号，展开实际语料原文。这里展示已有固定示例及加载、证据不足等状态，浏览时无需调用模型。
            </p>
          </section>
          <Suspense fallback={<LoadingPage />}>
            <CardGalleryPage />
          </Suspense>
        </>
      ) : (
        <AskStatus />
      )}
      <SiteFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
