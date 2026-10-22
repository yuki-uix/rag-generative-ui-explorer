/* oxlint-disable next/no-img-element -- Vinext displays a frozen PNG; next/image is not installed. */
import {
  SiteNav,
  SiteFooter,
  PROJECT_URL,
  LIVE_ASK_AVAILABLE,
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
              提出一个关于 RAG 或 Generative UI
              的问题。系统检索真实语料，再由模型选择并生成知识卡；点击卡片引用，就能看到本次回答依据的原文。
            </p>
            <div className="delivery-actions">
              <a
                className="delivery-button delivery-button-dark"
                href={appHref('/ask')}
              >
                提问并生成知识卡 <span>→</span>
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
          <a className="delivery-path-card" href={appHref('/ask')}>
            <span className="delivery-card-index">01 / 直接提问</span>
            <h2>
              {LIVE_ASK_AVAILABLE ? '向语料提问' : '实时服务状态'}{' '}
              <span>↗</span>
            </h2>
            <p>
              {LIVE_ASK_AVAILABLE
                ? '输入自己的问题，查看本次检索生成的动态知识卡、来源原文、模型和耗时。'
                : '查看实时知识卡链路与运行方式；此预览尚未连接在线服务。'}
            </p>
            <span className="delivery-tag">
              {LIVE_ASK_AVAILABLE
                ? '真实检索 · 动态知识卡'
                : '等待实时服务连接'}
            </span>
          </a>
          <a className="delivery-path-card" href={appHref('/cards')}>
            <span className="delivery-card-index">02 / 组件示例</span>
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
            <span className="delivery-card-index">03 / 图片实验</span>
            <h2>
              图片找对了吗？ <span>↗</span>
            </h2>
            <p>
              选一道题，并排检查文字、OCR 和 CLIP
              的真实排名。打开原图，看金标、误召回与适用边界。
            </p>
            <span className="delivery-tag">已实跑 · 浏览保存结果</span>
          </a>
        </section>
        <section className="delivery-home-boundary">
          <div>
            <span className="delivery-eyebrow">WHAT IS READY</span>
            <h2>交付从能核对开始。</h2>
          </div>
          <div>
            <p>
              当前可体验真实检索与动态知识卡，点击字段引用查看本次来源；组件示例与图片实验也保留为独立入口。
              网页上的图片排名来自已经保存的真实实验。
            </p>
            <p>
              结构与引用校验不等于事实已核实，生成的解释仍需核对原文。用户收益有待评估；图片实验没有接入
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
