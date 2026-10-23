export const PROJECT_URL =
  'https://github.com/yuki-uix/rag-generative-ui-explorer';
export const REVIEW_PR_URL = `${PROJECT_URL}/pull/92`;
export const STATIC_REVIEW = import.meta.env.VITE_REVIEW_STATIC === 'true';
export const LIVE_CARDS_ENDPOINT = import.meta.env.VITE_LIVE_CARDS_ENDPOINT as
  | string
  | undefined;
export const LIVE_ASK_AVAILABLE =
  !STATIC_REVIEW || Boolean(LIVE_CARDS_ENDPOINT);
const PREVIEW_UNMERGED = import.meta.env.VITE_REVIEW_IS_PR_PREVIEW !== 'false';
const PREVIEW_BUILD_SHA = import.meta.env.VITE_REVIEW_BUILD_SHA as
  | string
  | undefined;

/** Keep app routes and static asset paths usable under the Pages subdirectory. */
export function appHref(path: string): string {
  if (!STATIC_REVIEW) return path;
  const routes: Record<string, string> = {
    '/': '#home',
    '/cards': '#cards',
    '/experiments/images': '#images',
    '/ask': '#ask',
  };
  return (
    routes[path] ??
    (path.startsWith('/')
      ? `${import.meta.env.BASE_URL}${path.slice(1)}`
      : path)
  );
}

export function SiteNav({
  active,
}: {
  active: 'home' | 'images' | 'cards' | 'ask';
}) {
  return (
    <header className="delivery-nav">
      <a
        className="delivery-brand"
        href={appHref('/')}
        aria-label="RAG Explorer 首页"
      >
        <span className="delivery-brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>
          RAG <strong>Explorer</strong>
          <small>GENERATIVE UI · RESEARCH NOTES</small>
        </span>
      </a>
      <nav
        aria-label="主导航"
        style={{ overflowX: 'auto', maxWidth: '100%', whiteSpace: 'nowrap' }}
      >
        <a
          href={appHref('/')}
          aria-current={active === 'home' ? 'page' : undefined}
        >
          项目总览
        </a>
        <a
          href={appHref('/ask')}
          aria-current={active === 'ask' ? 'page' : undefined}
        >
          {LIVE_ASK_AVAILABLE ? '实时提问' : '问答状态'}
        </a>
        <a
          href={appHref('/cards')}
          aria-current={active === 'cards' ? 'page' : undefined}
        >
          卡片示例
        </a>
        <a
          href={appHref('/experiments/images')}
          aria-current={active === 'images' ? 'page' : undefined}
        >
          图片实验
        </a>
        <a href={PROJECT_URL} target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="delivery-footer">
      <span>
        RAG Generative UI Explorer <span aria-hidden="true">/</span>{' '}
        开放的实验与证据
        {STATIC_REVIEW ? (
          <>
            {' '}
            · {PREVIEW_UNMERGED ? 'PR 预览 · 未合并' : '项目预览'}
            {PREVIEW_BUILD_SHA && /^[0-9a-f]{40}$/i.test(PREVIEW_BUILD_SHA) ? (
              <>
                {' '}
                ·{' '}
                <a
                  href={`${PROJECT_URL}/commit/${PREVIEW_BUILD_SHA}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  预览提交 {PREVIEW_BUILD_SHA.slice(0, 7)} ↗
                </a>
              </>
            ) : null}
          </>
        ) : null}
      </span>
      <a href={REVIEW_PR_URL} target="_blank" rel="noreferrer">
        代码、协议与讨论 · PR #92 ↗
      </a>
    </footer>
  );
}
