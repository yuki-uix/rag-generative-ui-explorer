'use client';
/* oxlint-disable next/no-img-element -- Vinext has no next/image; display the small, frozen evidence PNGs without transforming them. */

import { useState } from 'react';
import type {
  ImageReviewArm,
  ImageReviewData,
  ImageReviewDataset,
  ImageReviewDatasetId,
  ImageReviewFigure,
  ImageReviewQuestion,
  ImageReviewRow,
} from '../../lib/image-review-types';
import {
  SiteNav,
  SiteFooter,
  PROJECT_URL,
  REVIEW_PR_URL,
  STATIC_REVIEW,
} from './site-nav';

const ARMS: ImageReviewArm[] = ['source-text', 'ocr', 'clip'];
const ARM_LABELS: Record<ImageReviewArm, string> = {
  'source-text': '文字检索',
  ocr: 'OCR 检索',
  clip: 'CLIP 检索',
  'visible-text-control': '印刷文字消融',
};
const ARM_NOTES: Record<ImageReviewArm, string> = {
  'source-text': '来源正文 · BM25',
  ocr: '真实 OCR · BM25',
  clip: '图文向量 · q8 CPU',
  'visible-text-control': '理想文字 · 参考组',
};
function kindLabel(kind: string) {
  switch (kind) {
    case 'conjunction':
      return '颜色＋位置';
    case 'color':
      return '颜色';
    case 'layout':
      return '位置／版式';
    case 'topic':
      return '主题';
    case 'literal':
      return '精确标签';
    case 'concept':
      return '概念';
    case 'negative':
      return '负例诊断';
    default:
      return kind;
  }
}
const pct = (value: number | null | undefined) =>
  value == null ? '—' : `${(100 * value).toFixed(1)}%`;
const imageUrl = (path: string) =>
  STATIC_REVIEW
    ? `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
    : path;
const attributeLabel = (f: ImageReviewFigure) =>
  [
    f.attributes.color === 'blue'
      ? '蓝色'
      : f.attributes.color === 'orange'
        ? '橙色'
        : '',
    (
      {
        column: '纵向排列',
        diamond: '菱形排列',
        chain: '链式',
        branches: '分支',
      } as Record<string, string>
    )[f.attributes.layout] ?? f.attributes.layout,
  ]
    .filter(Boolean)
    .join(' · ');

function RankingCard({
  row,
  dataset,
  question,
  within,
}: {
  row: ImageReviewRow;
  dataset: ImageReviewDataset;
  question: ImageReviewQuestion;
  within: boolean;
}) {
  const ranking = within ? row.withinRanking : row.ranking;
  const metrics = within ? row.withinMetrics : row.metrics;
  const top = ranking[0];
  const figure = dataset.figures.find((f) => f.id === top?.evidenceId);
  const hit = top && question.gold.includes(top.evidenceId);
  const expected = within ? row.withinExpectedHit1 : row.expectedHit1;
  return (
    <article className="review-arm" aria-label={ARM_LABELS[row.arm]}>
      <div className="review-arm-head">
        <strong>{ARM_LABELS[row.arm]}</strong>
        <span>{ARM_NOTES[row.arm]}</span>
      </div>
      {figure ? (
        <a
          className="review-top-image"
          href={imageUrl(figure.imagePath)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${ARM_LABELS[row.arm]}第一名 ${figure.id}，${question.gold.length ? (hit ? '命中记录金标' : '未命中记录金标') : '无相关金标'}，打开原图`}
        >
          <img
            src={imageUrl(figure.imagePath)}
            alt={`${figure.topic}，${attributeLabel(figure)}`}
            width="768"
            height="768"
          />
          <small>
            <span>01 · {figure.id}</span>
            <span
              className={`review-badge ${question.gold.length ? (hit ? 'review-badge-good' : 'review-badge-warn') : ''}`}
            >
              {question.gold.length
                ? hit
                  ? '命中记录金标'
                  : '未命中记录金标'
                : '无相关金标'}
            </span>
          </small>
        </a>
      ) : (
        <p className="review-empty">
          该组未返回候选。此现象不代表已验证拒答能力。
        </p>
      )}
      {figure?.warning ? (
        <p className="review-figure-warning">图示勘误：{figure.warning}</p>
      ) : null}
      <div className="review-arm-stats">
        <span>Recall@5 {pct(metrics?.recall5)}</span>
        <span>平局期望 {pct(expected)}</span>
      </div>
      <details>
        <summary>查看完整排名（{ranking.length}）与原始分数</summary>
        <ol className="review-rank-list">
          {ranking.map((item, i) => {
            const f = dataset.figures.find((f) => f.id === item.evidenceId)!;
            return (
              <li
                key={item.evidenceId}
                data-relevant={question.gold.includes(item.evidenceId)}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                <a
                  href={imageUrl(f.imagePath)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.evidenceId}
                  {question.gold.includes(item.evidenceId) ? ' ✓' : ''}
                </a>
                <code title={String(item.score)}>{item.score.toFixed(4)}</code>
              </li>
            );
          })}
        </ol>
      </details>
    </article>
  );
}

export function ImageExperimentReview({ data }: { data: ImageReviewData }) {
  const [datasetId, setDatasetId] = useState<ImageReviewDatasetId>('control');
  const [questionId, setQuestionId] = useState('doc-02-diamond');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [scope, setScope] = useState('all');
  const [evidenceId, setEvidenceId] = useState('');
  const dataset = data.datasets.find((d) => d.id === datasetId)!;
  const question =
    dataset.questions.find((q) => q.id === questionId) ?? dataset.questions[0]!;
  const queries = dataset.questions.filter(
    (q) =>
      (kind === 'all' || q.kind === kind) &&
      `${q.id} ${q.text} ${kindLabel(q.kind)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const rows = dataset.rows.filter((r) => r.questionId === question.id);
  const within = datasetId === 'control' && scope === 'within';
  const selectedFigure =
    dataset.figures.find((f) => f.id === evidenceId) ??
    dataset.figures.find((f) => f.id === question.gold[0]) ??
    dataset.figures[0]!;
  const failure = dataset.failureCases.find(
    (f) => f.questionId === question.id,
  );
  const control = data.datasets.find((d) => d.id === 'control')!;
  const repoFile = (path: string) =>
    `${PROJECT_URL}/blob/${data.provenance.sourceHead}/${path}`;
  function chooseQuestion(id: string) {
    setQuestionId(id);
    setEvidenceId('');
  }
  function chooseDataset(id: ImageReviewDatasetId) {
    setDatasetId(id);
    setSearch('');
    setKind('all');
    setScope('all');
    setEvidenceId('');
    setQuestionId(
      id === 'control'
        ? 'doc-02-diamond'
        : data.datasets.find((d) => d.id === id)!.questions[0]!.id,
    );
  }
  return (
    <div className="delivery-site" lang="zh-CN">
      <SiteNav active="images" />
      <main className="delivery-main">
        <div className="review-heading">
          <div>
            <div className="delivery-eyebrow">
              <span /> EXPERIMENT 01 / IMAGE RETRIEVAL
            </div>
            <h1>图片找对了吗？</h1>
            <p>
              选择一道真实评测题，核对文字、OCR 与 CLIP
              的检索结果。打开原图，看看分数背后发生了什么。
            </p>
          </div>
          <div className="review-heading-links">
            <a
              href={repoFile(data.provenance.reportPath)}
              target="_blank"
              rel="noreferrer"
            >
              完整审查报告 ↗
            </a>
            <a href={REVIEW_PR_URL} target="_blank" rel="noreferrer">
              PR #92 ↗
            </a>
          </div>
        </div>
        <div className="review-stats">
          <div className="review-stat">
            <span>独立图片语料</span>
            <strong>
              {dataset.figures.length}
              <small> 张</small>
            </strong>
            <small>
              {datasetId === 'control'
                ? '6 个主题 × 颜色与位置交叉'
                : '12 个来源 × 两种图示'}
            </small>
          </div>
          <div className="review-stat">
            <span>固定评测问题</span>
            <strong>
              {dataset.questions.length}
              <small> 道</small>
            </strong>
            <small>
              {datasetId === 'control'
                ? '每种属性均衡提问'
                : '概念与版式题已标记限制'}
            </small>
          </div>
          <div className="review-stat">
            <span>CLIP 编码重复</span>
            <strong>
              {data.provenance.repetitions}
              <small> 次</small>
            </strong>
            <small>显示第 1 次 · 排名三次一致</small>
          </div>
          <div className="review-stat">
            <span>托管推理调用</span>
            <strong>
              0<small> 次</small>
            </strong>
            <small>本地运行 · 硬件等费用未计价</small>
          </div>
        </div>
        <div className="review-tabs" aria-label="实验数据集">
          {data.datasets.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={datasetId === d.id}
              onClick={() => chooseDataset(d.id)}
            >
              {d.id === 'control' ? '等文字控制实验' : '原始实验与金标审查'}
              <span>{d.questions.length} 题</span>
            </button>
          ))}
        </div>
        <p className="review-notice">
          {datasetId === 'control'
            ? '阅读提示：这是观察旧结果后设计的控制实验，只有 6 个已见主题，未经独立人工裁决。颜色题有改善，位置题尚不足以支持稳定空间理解；不要把它当成模型总排名。'
            : '历史记录：原始标签与排名保持不变。12 道概念题的相关性未穷尽审定，12 道版式题混合了文字、颜色和箭头变化，均已退出主比较；4 道负例不计作拒答准确率。'}
        </p>
        <div className="review-browser">
          <aside className="review-sidebar" aria-label="评测题选择">
            <div className="review-sidebar-head">
              <label htmlFor="review-search">
                固定题库 · {queries.length} / {dataset.questions.length}
              </label>
              <input
                id="review-search"
                type="search"
                placeholder="搜索题目或主题…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                aria-label="按题型筛选"
              >
                <option value="all">全部题型</option>
                {[...new Set(dataset.questions.map((q) => q.kind))].map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
            </div>
            <div className="review-query-list">
              {queries.length ? (
                queries.map((q, i) => (
                  <button
                    type="button"
                    key={q.id}
                    aria-pressed={question.id === q.id}
                    onClick={() => chooseQuestion(q.id)}
                  >
                    <span>
                      {String(i + 1).padStart(2, '0')} / {kindLabel(q.kind)} ·{' '}
                      {q.family}
                    </span>
                    <strong>{q.text}</strong>
                    {dataset.failureCases.some((f) => f.questionId === q.id) ? (
                      <small>↳ 已记录失败案例</small>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="review-empty">
                  没有匹配题目。请清空搜索或切换题型。
                </div>
              )}
            </div>
          </aside>
          <div className="review-detail">
            <section className="review-question" aria-live="polite">
              <div className="review-question-meta">
                <span>
                  {kindLabel(question.kind)} / {question.id}
                </span>
                <span>测量于 {dataset.measuredAt}</span>
              </div>
              <h2>{question.text}</h2>
              <div className="review-badges">
                <span className="review-badge">
                  {question.gold.length} 张记录金标
                </span>
                <span
                  className={`review-badge ${datasetId === 'control' || question.primary ? 'review-badge-good' : 'review-badge-warn'}`}
                >
                  {datasetId === 'control'
                    ? '属性派生金标 · 事后诊断'
                    : question.primary
                      ? '精确标签查找'
                      : '不用于主比较'}
                </span>
                <span className="review-badge">固定题库 · 浏览不调用模型</span>
              </div>
              {failure ? (
                <p>
                  <strong>失败观察：</strong>
                  {failure.explanation}
                </p>
              ) : null}
              {datasetId === 'legacy' ? (
                <p>
                  <strong>审查记录：</strong>
                  {question.reason}
                  {question.knownAlternatives?.length
                    ? ` 已知相关备选：${question.knownAlternatives.join('、')}。`
                    : ''}
                </p>
              ) : null}
            </section>
            {datasetId === 'control' ? (
              <label className="review-mode-line">
                排名范围
                <select
                  aria-label="排名范围"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="all">全库检索 · 24 张图片</option>
                  <option value="within">已知正确主题 · 4 张图片</option>
                </select>
                <span>
                  {within
                    ? '条件选图测试，预先给定正确主题；不是全库召回能力。'
                    : '包含主题检索与视觉选择两个环节。'}
                </span>
              </label>
            ) : null}
            <div className="review-section-label">
              三组 Top 1 对照 <span>分数尺度不同，请勿跨组比较数值</span>
            </div>
            <div className="review-ranks">
              {ARMS.map((arm) => {
                const row = rows.find((r) => r.arm === arm);
                return row ? (
                  <RankingCard
                    key={`${datasetId}-${question.id}-${arm}-${scope}`}
                    row={row}
                    dataset={dataset}
                    question={question}
                    within={within}
                  />
                ) : null;
              })}
            </div>
            <div className="review-section-label">
              {datasetId === 'control'
                ? '按冻结属性定义的正确图片'
                : '原始记录的金标图片'}{' '}
              <span>点击图片打开原尺寸 · 不等同独立人工审定</span>
            </div>
            {question.gold.length ? (
              <div className="review-gold-grid">
                {question.gold.map((id) => {
                  const f = dataset.figures.find((item) => item.id === id)!;
                  return (
                    <article key={id} className="review-gold-card">
                      <a
                        href={imageUrl(f.imagePath)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          loading="lazy"
                          src={imageUrl(f.imagePath)}
                          alt={`记录金标 ${f.id}，${f.topic}，${attributeLabel(f)}`}
                          width="768"
                          height="768"
                        />
                        <p>{f.id} ↗</p>
                      </a>
                      <small>{attributeLabel(f)}</small>
                      {f.warning ? (
                        <p className="review-figure-warning">
                          图示勘误：{f.warning}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="review-empty">
                此题没有相关金标，是未经校准的负例诊断。
              </p>
            )}
            <details
              className="review-evidence-details"
              key={`${datasetId}-${question.id}-evidence`}
            >
              <summary>核对来源正文、真实 OCR 与图像身份</summary>
              <div className="review-evidence-content">
                <label className="review-mode-line">
                  查看图片
                  <select
                    aria-label="选择证据图"
                    value={selectedFigure.id}
                    onChange={(e) => setEvidenceId(e.target.value)}
                  >
                    {dataset.figures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id} · {attributeLabel(f)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedFigure.warning ? (
                  <p className="review-notice">{selectedFigure.warning}</p>
                ) : null}
                <h3>真实 OCR 输出 · 未修正识别错误</h3>
                <pre>{selectedFigure.ocrText || '（未识别到文字）'}</pre>
                <h3>文字组索引的来源正文</h3>
                <pre>{selectedFigure.sourceText}</pre>
                <p>
                  <a
                    href={repoFile(selectedFigure.sourcePath)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看来源文件 ↗
                  </a>
                </p>
                <h3>图片 SHA-256</h3>
                <pre>{selectedFigure.imageSha256}</pre>
              </div>
            </details>
            {datasetId === 'control' ? (
              <details
                className="review-evidence-details"
                key={`${question.id}-oracle`}
              >
                <summary>印刷文字消融：如果文字识别完全正确呢？</summary>
                <div className="review-evidence-content">
                  <p>
                    这个参考组使用图上已知文字；同主题四张图的文字完全相同，无法仅靠词语区分颜色与位置。它不是第四个竞争模型。
                  </p>
                  <p>
                    当前题：全库 Top 1{' '}
                    {rows.find((r) => r.arm === 'visible-text-control')
                      ?.ranking[0]?.evidenceId ?? '—'}
                    ；主题内 Hit@1{' '}
                    {pct(
                      rows.find((r) => r.arm === 'visible-text-control')
                        ?.withinHit1,
                    )}
                    。
                  </p>
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <section className="review-bottom">
          <div>
            <h2>改善在哪，边界在哪？</h2>
            <p>
              下表只看新控制实验的「已知正确主题，四图选一」。不是全库检索成绩，也不是通用模型能力。重复三次不增加独立样本数。
            </p>
            <table>
              <thead>
                <tr>
                  <th>题型 / 固定题数</th>
                  <th>文字 / OCR</th>
                  <th>CLIP</th>
                </tr>
              </thead>
              <tbody>
                {['conjunction', 'color', 'layout', 'topic'].map((k) => {
                  const clip = control.summary.find(
                    (s) => s.kind === k && s.arm === 'clip',
                  )!;
                  const text = control.summary.find(
                    (s) => s.kind === k && s.arm === 'source-text',
                  )!;
                  const ocr = control.summary.find(
                    (s) => s.kind === k && s.arm === 'ocr',
                  )!;
                  return (
                    <tr key={k}>
                      <td>
                        {kindLabel(k)} / {clip.questions}
                      </td>
                      <td>
                        {pct(text.withinHit1)} / {pct(ocr.withinHit1)}
                      </td>
                      <td>{pct(clip.withinHit1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>
              位置题为 7/12，平衡参考为 6/12，只多答对一题。全库位置题 CLIP
              Hit@1 降至 25.0%，说明主题匹配也会失败。
            </p>
            <div className="review-failures">
              {control.failureCases.map((f) => (
                <button
                  type="button"
                  key={f.questionId}
                  onClick={() => {
                    chooseDataset('control');
                    chooseQuestion(f.questionId);
                  }}
                >
                  {f.title} ↗
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2>真实运行与可复核记录</h2>
            <p>
              Apple M4 Pro · {data.provenance.model} · {data.provenance.dtype} ·{' '}
              {data.provenance.device}。本地 OCR 与 CLIP
              实际执行，网页只读取保存结果。
            </p>
            <ul>
              <li>
                新控制 OCR：{(control.timing.ocrMs / 1000).toFixed(2)} 秒 / 24
                张图。
              </li>
              <li>
                三遍 CLIP 编码阶段：
                {(control.timing.clipTotalMs / 1000).toFixed(2)}{' '}
                秒，含缓存加载与文件校验、导出；不含 Node
                启动与最终元数据序列化。
              </li>
              <li>
                图像编码中位数 {control.timing.imageMedianMs.toFixed(2)}{' '}
                ms；查询编码中位数 {control.timing.queryMedianMs.toFixed(2)}{' '}
                ms；进程峰值约 {Math.round(control.timing.peakRssKiB / 1024)}{' '}
                MiB。
              </li>
              <li>{data.provenance.costNote}</li>
            </ul>
            <p>
              <a
                href={repoFile('eval/images-review/PROTOCOL.md')}
                target="_blank"
                rel="noreferrer"
              >
                冻结协议 ↗
              </a>
              　
              <a
                href={repoFile(
                  'eval/images-review/results/2026-10-22/records.jsonl',
                )}
                target="_blank"
                rel="noreferrer"
              >
                原始逐题结果 ↗
              </a>
            </p>
            <details className="review-evidence-details">
              <summary>研究限制与数据溯源</summary>
              <div className="review-evidence-content">
                <ul>
                  {dataset.limitations.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
                <pre>
                  模型版本：{data.provenance.revision}
                  {'\n'}运行时：{data.provenance.runtime}
                  {'\n'}实验提交：{data.provenance.sourceHead}
                  {'\n'}输入冻结 SHA：{dataset.freezeSha256}
                  {'\n'}观测密封 SHA：{dataset.ledgerSha256}
                </pre>
              </div>
            </details>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
