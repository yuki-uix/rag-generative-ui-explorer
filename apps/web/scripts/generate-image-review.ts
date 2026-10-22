/** Read-only projection of sealed observations. Never runs OCR, inference or downloads. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyControlFreeze,
  expectedHit1,
} from '../../../packages/corpus/src/image-review.js';
import { verifyReviewObservations } from '../../../packages/corpus/src/image-review-observations.js';
import { verifyImageObservations } from '../../../packages/corpus/src/image-observations.js';
import {
  verifyFreeze,
  OCR,
  sha,
  rankingMetrics,
} from '../../../packages/corpus/src/image-experiment.js';
import type {
  ImageReviewData,
  ImageReviewDataset,
  ImageReviewFigure,
  ImageReviewRow,
  ImageReviewMetrics,
  ImageReviewArm,
  ImageReviewSummary,
} from '../lib/image-review-types.js';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(webRoot, '../..');
const controlsRoot = resolve(repository, 'eval/images-review');
const legacyRoot = resolve(repository, 'eval/images');
const json = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T;
const jsonLines = <T>(path: string): T[] =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as T);
const arm = (value: string): ImageReviewArm => {
  if (value === 'text') return 'source-text';
  if (['source-text', 'ocr', 'clip', 'visible-text-control'].includes(value))
    return value as ImageReviewArm;
  throw new Error(`Unknown sealed arm: ${value}`);
};
const body = (source: string) =>
  source.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '');
type Ranked = { evidenceId: string; score: number };
type RecordedRow = {
  repetition: number;
  arm: string;
  questionId: string;
  ranking: Ranked[];
  metrics: ImageReviewMetrics | null;
  expectedHit1?: number | null;
  sourceHit1?: number;
  withinFamily?: {
    metrics: ImageReviewMetrics | null;
    expectedHit1: number | null;
  };
  clipTopicOnlyHit1?: number | null;
};
type ReviewSummary = {
  summary: {
    arm: string;
    kind: string;
    uniqueQuestions: number;
    repetitions: {
      repetition: number;
      fullHit1: number;
      withinHit1: number;
      sourceHit1: number;
      fullRecall5: number;
      tieExpectedHit1: number;
    }[];
  }[];
  timing: {
    ocrMs: number;
    clipLoadMs: number;
    clipTotalMs: number;
    peakRssKiB: number;
    imageMs: { median: number };
    queryMs: { median: number };
  };
  legacyDiagnostics: {
    arm: string;
    category: string;
    uniqueQuestions: number;
    deterministicHit1: number;
    tieExpectedHit1: number;
    sourceFamilyHit1: number;
  }[];
};
type LegacySummary = {
  observations: {
    ocr: { totalMs: number };
    clip: {
      loadMs: number;
      totalMs: number;
      peakRssKiB: number;
      imageEncodingMs: { median: number };
      queryEncodingMs: { median: number };
    };
  };
};
type GoldAudit = {
  rows: {
    questionId: string;
    status: string;
    primary: boolean;
    reason: string;
    knownAlternative: string[] | null;
  }[];
};

function projectRows(
  records: RecordedRow[],
  dataset: Pick<ImageReviewDataset, 'figures' | 'questions'>,
): ImageReviewRow[] {
  const questions = new Map(dataset.questions.map((q) => [q.id, q]));
  const figures = new Map(dataset.figures.map((f) => [f.id, f]));
  return records
    .filter((row) => row.repetition === 1)
    .map((row): ImageReviewRow => {
      const question = questions.get(row.questionId);
      if (
        !question ||
        row.ranking.some(
          (r) => !figures.has(r.evidenceId) || !Number.isFinite(r.score),
        )
      )
        throw new Error('Observation projection has unknown IDs or scores.');
      const withinRanking = row.ranking.filter(
        (r) => figures.get(r.evidenceId)!.family === question.family,
      );
      const withinMetrics =
        row.withinFamily?.metrics ??
        rankingMetrics(
          withinRanking.map((r) => r.evidenceId),
          question.gold,
        );
      return {
        questionId: row.questionId,
        arm: arm(row.arm),
        repetition: 1,
        ranking: row.ranking,
        metrics: row.metrics,
        withinRanking,
        withinMetrics,
        withinHit1: withinMetrics?.hit1 ?? null,
        sourceHit1: question.gold.length
          ? (row.sourceHit1 ??
            Number(
              figures.get(row.ranking[0]?.evidenceId ?? '')?.family ===
                question.family,
            ))
          : null,
        expectedHit1:
          row.expectedHit1 ?? expectedHit1(row.ranking, question.gold),
        withinExpectedHit1:
          row.withinFamily?.expectedHit1 ??
          expectedHit1(withinRanking, question.gold),
        topicOnlyHit1: row.clipTopicOnlyHit1 ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.questionId.localeCompare(b.questionId, 'en') ||
        a.arm.localeCompare(b.arm, 'en'),
    );
}

/** Verifies all upstream seals before reading any browser output. */
export function buildImageReviewData(): ImageReviewData {
  const controls = verifyControlFreeze(controlsRoot);
  verifyReviewObservations(controlsRoot);
  verifyImageObservations(legacyRoot);
  const legacy = verifyFreeze(legacyRoot);
  const reviewSummary = json<ReviewSummary>(
    resolve(controlsRoot, 'results/2026-10-22/summary.json'),
  );
  const legacySummary = json<LegacySummary>(
    resolve(legacyRoot, 'results/2026-10-21/summary.json'),
  );
  const audit = new Map(
    json<GoldAudit>(
      resolve(controlsRoot, 'results/2026-10-22/gold-audit.json'),
    ).rows.map((row) => [row.questionId, row]),
  );
  const controlOcr = new Map(
    OCR.parse(
      json<unknown>(resolve(controlsRoot, 'artifacts/ocr.json')),
    ).records.map((row) => [row.id, row.text]),
  );
  const legacyOcr = new Map(
    OCR.parse(
      json<unknown>(resolve(legacyRoot, 'artifacts/ocr.json')),
    ).records.map((row) => [row.id, row.text]),
  );
  const sourceText = (path: string) =>
    body(readFileSync(resolve(legacyRoot, path), 'utf8'));
  const originalById = new Map(legacy.figures.map((f) => [f.id, f]));
  const controlFigures: ImageReviewFigure[] = controls.figures.map((f) => ({
    id: f.id,
    topic: f.title,
    family: f.family,
    imagePath: `/experiments/images/control/${f.id}.png`,
    attributes: { color: f.color, layout: f.layout },
    visibleText: f.visibleText,
    sourceText: sourceText(f.source),
    ocrText: controlOcr.get(f.id)!,
    sourcePath: originalById.get(f.sourceFigure)!.sourcePath,
    imageSha256: f.imageSha256,
  }));
  const legacyFigures: ImageReviewFigure[] = legacy.figures.map((f) => {
    const text = sourceText(f.source);
    return {
      id: f.id,
      topic: text.match(/^#\s+(.+)$/m)?.[1] ?? f.group,
      family: f.group,
      imagePath: `/experiments/images/legacy/${f.id}.png`,
      attributes: {
        color: f.render.layout === 'vertical-chain' ? 'blue' : 'orange',
        layout: f.render.layout,
        split: f.split,
      },
      visibleText: [
        text.match(/^#\s+(.+)$/m)?.[1] ?? f.group,
        ...f.render.nodes,
      ],
      sourceText: text,
      ocrText: legacyOcr.get(f.id)!,
      sourcePath: f.sourcePath,
      imageSha256: f.imageSha256,
      ...(f.id === 'figure-07-a'
        ? {
            warning:
              '已确认内容勘误：原意被画成串行末级；原图保留用于复算，不作为正确流程图。勘误见 GitHub 审查报告。',
          }
        : {}),
    };
  });
  const controlQuestions = controls.questions.map((q) => ({
    id: q.id,
    text: q.question,
    kind: q.kind,
    family: q.family,
    gold: q.goldenImageIds,
    status: 'post-hoc-factorial-diagnostic',
    primary: false,
    reason:
      '同主题四图文字一致，颜色和位置交叉；金标按显式属性定义。事后诊断，非盲测或全新效果基准。',
  }));
  const legacyQuestions = legacy.questions.map((q) => {
    const review = audit.get(q.id);
    if (!review) throw new Error('Missing sealed legacy gold review.');
    return {
      id: q.id,
      text: q.question,
      kind: q.category,
      family: q.group,
      gold: q.goldenImageIds,
      status: review.status,
      primary: review.primary,
      reason: review.reason,
      split: q.split,
      ...(review.knownAlternative
        ? { knownAlternatives: review.knownAlternative }
        : {}),
    };
  });
  const timing = reviewSummary.timing;
  const controlsDataset: ImageReviewDataset = {
    id: 'control',
    title: '等文字控制实验',
    measuredAt: '2026-10-22',
    description:
      '6 个来源主题 × 4 张颜色与位置交叉图。24 张图片、54 道固定问题、3 次真实本地运行。网页展示第 1 次完整排名。',
    limitations: [
      '这是看到旧结果后建立的事后诊断；同一作者制作、评估及审查，未经独立人工裁决。',
      '每个主题只有四张图。来源命中、主题内选图和全库选图是不同指标；主题内排名仅过滤原全库排名，不重建索引。',
      '位置题 CLIP 为 7/12，平衡参考为 6/12；跨六个模板相关，不能据此宣称稳定空间理解。',
      '文字组每来源只索引一份正文，再将同分展开到四图；OCR 只看图中文字。不同组可用信息不同，分数尺度不可跨组比较。',
      'visible-text-control 使用已知印刷文字，是消融参考，不是第四个竞争模型。',
      '四张同主题图都能进入 Top 5，文字组 Recall@5 很容易满分；颜色/位置题有两个金标，Hit@1 不等于 Recall@1。',
      '控制图没有箭头，仅测试颜色与物理摆放，不能用于证明流程或依赖关系理解。',
    ],
    figures: controlFigures,
    questions: controlQuestions,
    rows: projectRows(
      jsonLines<RecordedRow>(
        resolve(controlsRoot, 'results/2026-10-22/records.jsonl'),
      ),
      { figures: controlFigures, questions: controlQuestions },
    ),
    summary: reviewSummary.summary.map((row) => {
      const first = row.repetitions.find((pass) => pass.repetition === 1)!;
      return {
        arm: arm(row.arm),
        kind: row.kind,
        questions: row.uniqueQuestions,
        fullHit1: first.fullHit1,
        withinHit1: first.withinHit1,
        sourceHit1: first.sourceHit1,
        expectedHit1: first.tieExpectedHit1,
        recall5: first.fullRecall5,
      };
    }),
    timing: {
      ocrMs: timing.ocrMs,
      clipLoadMs: timing.clipLoadMs,
      clipTotalMs: timing.clipTotalMs,
      peakRssKiB: timing.peakRssKiB,
      imageMedianMs: timing.imageMs.median,
      queryMedianMs: timing.queryMs.median,
    },
    freezeSha256: controls.freezeSha256,
    ledgerSha256: sha(readFileSync(resolve(controlsRoot, 'observations.json'))),
    failureCases: [
      {
        questionId: 'doc-02-diamond',
        title: '主题选错，主题内选图正确',
        explanation:
          'CLIP 的全库第一张来自增量渲染主题；限制到正确主题后能命中菱形图。应区分找主题与选版式。',
      },
      {
        questionId: 'doc-10-column',
        title: '主题内仍然选错位置',
        explanation:
          '即使只看正确来源的四图，CLIP 也没有把竖排金标放在首位，不能只用全库主题混淆解释错误。',
      },
      {
        questionId: 'doc-02-blue',
        title: '颜色也会失败',
        explanation:
          '12 道颜色题中唯一一次 CLIP 失误：请求蓝色，首位却是同主题橙色 control-01-4。',
      },
    ],
  };
  const oldTiming = legacySummary.observations;
  const legacyDataset: ImageReviewDataset = {
    id: 'legacy',
    title: '原始冻结实验',
    measuredAt: '2026-10-21',
    description:
      '保留 24 张原图、52 道原题与三组真实排名。只将 24 道精确标签查找题纳入相应查找比较，其余为带审查警告的历史诊断。',
    limitations: [
      '原始标签与分数没有改写。24 道 literal 仅验证精确标签查找，不证明语义回答正确。',
      '12 道 concept 退出主比较：融合题有确定遗漏金标，一张原图存在流程内容错误，其余未穷尽裁决替代相关图。',
      '12 道旧 layout 同时改变颜色、文字、箭头与长度；不能把 OCR 命中率归因于空间理解。',
      '同来源正文复制给两图，分数平局按 ID 排序可偏向 a 图；请同时看均匀平局期望和来源命中。',
      '4 道 negative 没有金标，也没有校准拒答阈值；排名或空列表均不能计作拒答准确率。',
      '原实验按来源划分开发/评估集，但同一作者制作并评估，未经独立人工裁决。',
      '历史 summary 只展示已有审查覆盖的标签题与旧版式诊断，不能汇总成全题效果或模型采用结论。',
    ],
    figures: legacyFigures,
    questions: legacyQuestions,
    rows: projectRows(
      jsonLines<RecordedRow>(
        resolve(legacyRoot, 'results/2026-10-21/records.jsonl'),
      ),
      { figures: legacyFigures, questions: legacyQuestions },
    ),
    summary: reviewSummary.legacyDiagnostics.map(
      (row): ImageReviewSummary => ({
        arm: arm(row.arm),
        kind: row.category,
        questions: row.uniqueQuestions,
        fullHit1: row.deterministicHit1,
        withinHit1: null,
        sourceHit1: row.sourceFamilyHit1,
        expectedHit1: row.tieExpectedHit1,
        recall5: null,
      }),
    ),
    timing: {
      ocrMs: oldTiming.ocr.totalMs,
      clipLoadMs: oldTiming.clip.loadMs,
      clipTotalMs: oldTiming.clip.totalMs,
      peakRssKiB: oldTiming.clip.peakRssKiB,
      imageMedianMs: oldTiming.clip.imageEncodingMs.median,
      queryMedianMs: oldTiming.clip.queryEncodingMs.median,
    },
    freezeSha256: legacy.freezeSha256,
    ledgerSha256: sha(readFileSync(resolve(legacyRoot, 'observations.json'))),
    failureCases: [],
  };
  return {
    version: 'image-review-web-1',
    datasets: [controlsDataset, legacyDataset],
    provenance: {
      model: controls.config.model,
      revision: controls.config.revision,
      dtype: controls.config.dtype,
      device: controls.config.device,
      dimensions: controls.config.dimensions,
      repetitions: controls.config.repetitions,
      displayedRepetition: 1,
      author: 'Codex assistant；同一作者制作、执行并审查',
      independentlyAdjudicated: false,
      providerApiCalls: 0,
      costNote:
        '两次实验均为本地模型：提供商调用 0 次、托管 API 费用 0。硬件、电力和工程投入未定价；这不代表总成本为零。CLIP 总阶段耗时含加载，非完整端到端延迟。OCR 使用 Apple Vision 默认系统设备，CLIP 固定 CPU。新实验未单独计时索引构建。',
      runtime:
        'Apple M4 Pro · Transformers.js 3.8.1 · ONNX Runtime 1.21.0 · q8 CPU · Apple Vision 3',
      reportPath: 'eval/images-review/REVIEW.md',
      repositoryUrl: 'https://github.com/yuki-uix/rag-generative-ui-explorer',
      sourceHead: 'a80c9fa27095e8cc98ed2080586bcc498c6f6786',
    },
  };
}

/** Exact expected public bytes: intentionally excludes weights, vectors and execution code. */
export function imageReviewPublicFiles(
  data: ImageReviewData,
): Map<string, Buffer> {
  return new Map(
    data.datasets.flatMap((dataset) =>
      dataset.figures.map((figure) => {
        const source = resolve(
          dataset.id === 'control' ? controlsRoot : legacyRoot,
          'assets',
          `${figure.id}.png`,
        );
        const bytes = readFileSync(source);
        if (sha(bytes) !== figure.imageSha256)
          throw new Error('Public image projection hash mismatch.');
        return [figure.imagePath, bytes] as const;
      }),
    ),
  );
}

export function generateImageReview(check = false) {
  const data = buildImageReviewData();
  const files = imageReviewPublicFiles(data);
  const fixture = resolve(webRoot, 'fixtures/image-review.json');
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (check) {
    if (readFileSync(fixture, 'utf8') !== serialized)
      throw new Error('Image review fixture is stale; regenerate it.');
    for (const [path, bytes] of files) {
      if (!readFileSync(resolve(webRoot, `public${path}`)).equals(bytes))
        throw new Error(`Public image is stale: ${path}`);
    }
    for (const id of ['control', 'legacy']) {
      const names = readdirSync(
        resolve(webRoot, `public/experiments/images/${id}`),
      ).sort();
      const expected = data.datasets
        .find((dataset) => dataset.id === id)!
        .figures.map((f) => `${f.id}.png`)
        .sort();
      if (JSON.stringify(names) !== JSON.stringify(expected))
        throw new Error('Unexpected public image files.');
    }
  } else {
    mkdirSync(dirname(fixture), { recursive: true });
    writeFileSync(fixture, serialized);
    for (const [path, bytes] of files) {
      const target = resolve(webRoot, `public${path}`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
  }
  return {
    datasets: data.datasets.length,
    questions: data.datasets.reduce((n, d) => n + d.questions.length, 0),
    images: files.size,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check'))
    throw new Error('Usage: generate-image-review.ts [--check]');
  console.log(
    JSON.stringify({
      mode: args[0] === '--check' ? 'check' : 'generate',
      ...generateImageReview(args[0] === '--check'),
    }),
  );
}
