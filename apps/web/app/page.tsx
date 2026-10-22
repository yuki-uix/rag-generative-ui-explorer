/* oxlint-disable next/no-img-element -- Vinext displays a frozen PNG; next/image is not installed. */
import {
  SiteNav,
  SiteFooter,
  PROJECT_URL,
  STATIC_REVIEW,
  appHref,
} from '@/components/review/site-nav';

export default function Home() {
  return (
    <div className="delivery-site" lang="zh-CN">
      <SiteNav active="home" />
      <main className="delivery-main delivery-home">
        <div className="delivery-eyebrow">
          <span /> OPEN RESEARCH · RAG & GENERATIVE UI
        </div>
        <section className="delivery-home-hero">
          <div>
            <h1>
              让答案背后的
              <br />
              <em>证据，看得见。</em>
            </h1>
            <p>
              这个项目探索如何把检索到的技术知识，呈现为能追溯来源的知识卡。先打开一张卡，点击引用查看原文；再去图片实验，核对三种检索方法的实际结果。
            </p>
            <div className="delivery-actions">
              <a
                className="delivery-button delivery-button-dark"
                href={appHref('/cards')}
              >
                先体验知识卡 <span>→</span>
              </a>
              <a
                className="delivery-text-link"
                href={appHref('/experiments/images')}
              >
                查看图片实验 →
              </a>
            </div>
          </div>
          <div className="delivery-hero-evidence">
            <div className="delivery-mini-caption">
              <span>图片实验样例</span>
              <span>24 张控制图 · 54 道题</span>
            </div>
            <img
              src={appHref('/experiments/images/control/control-01-1.png')}
              alt="图片检索实验中的控制图示例，相同文字交叉改变颜色与位置"
              width="768"
              height="768"
            />
            <div className="delivery-evidence-caption">
              <span className="delivery-dot" /> 实际图像与已记录排名，可逐题核对
            </div>
          </div>
        </section>
        <section className="delivery-home-paths" aria-label="评审入口">
          <a className="delivery-path-card" href={appHref('/cards')}>
            <span className="delivery-card-index">01 / 先体验</span>
            <h2>
              知识如何呈现？ <span>↗</span>
            </h2>
            <p>
              浏览定义、比较、机制、步骤和证据五类知识卡，点击引用编号展开原文。卡片使用语料中的固定示例。
            </p>
            <span className="delivery-tag">已有组件 · 可点击核对来源</span>
          </a>
          <a
            className="delivery-path-card"
            href={appHref('/experiments/images')}
          >
            <span className="delivery-card-index">02 / 再看实验</span>
            <h2>
              图片找对了吗？ <span>↗</span>
            </h2>
            <p>
              选一道题，并排检查文字、OCR 和 CLIP
              的真实排名。打开原图，看金标、误召回与适用边界。
            </p>
            <span className="delivery-tag">已实跑 · 浏览保存结果</span>
          </a>
          <a className="delivery-path-card" href={appHref('/ask')}>
            <span className="delivery-card-index">03 / 问答链路</span>
            <h2>
              {STATIC_REVIEW ? '问答做到哪了？' : '向语料提问'} <span>↗</span>
            </h2>
            <p>
              {STATIC_REVIEW
                ? '查看已实现的服务器问答链路与运行方式。当前 GitHub 静态预览提供功能状态说明，实时问答需要另行运行服务端。'
                : '体验文字检索与流式回答，核查实际召回的段落和引用。此入口调用服务器配置的真实模型。'}
            </p>
            <span className="delivery-tag">
              {STATIC_REVIEW
                ? '服务器代码已实现 · 静态页不含 API'
                : '在线模型 · Markdown 回答'}
            </span>
          </a>
        </section>
        <section className="delivery-home-boundary">
          <div>
            <span className="delivery-eyebrow">WHAT IS READY</span>
            <h2>交付从能核对开始。</h2>
          </div>
          <div>
            <p>
              {STATIC_REVIEW
                ? '当前网页可体验知识卡与来源展开，可核对图片检索的真实实验结果。服务器端文字检索、流式回答与引用验证已有实现，运行状态和代码在问答入口说明。'
                : '当前可评审的是检索与引用验证链路、知识卡组件，以及独立的图片检索实验。'}
              网页上的图片排名来自已经保存的真实实验。
            </p>
            <p>
              动态知识卡的整体体验和用户收益仍待整合与评估；图片实验没有接入
              LLaVA，也不改动 F5 基线。完成状态以{' '}
              <a href={appHref(`${PROJECT_URL}/issues`)}>GitHub issues</a>{' '}
              和实验记录为准。
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
