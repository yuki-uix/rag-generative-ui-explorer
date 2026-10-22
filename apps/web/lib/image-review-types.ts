/** Browser-only projection of sealed image experiments. No execution dependencies. */
export type ImageReviewArm =
  | 'source-text'
  | 'ocr'
  | 'clip'
  | 'visible-text-control';
export type ImageReviewDatasetId = 'control' | 'legacy';
export interface ImageReviewMetrics {
  recall1: number;
  recall3: number;
  recall5: number;
  hit1: number;
  hit3: number;
  hit5: number;
  mrr5: number;
  ndcg5: number;
}
export interface ImageReviewFigure {
  id: string;
  topic: string;
  family: string;
  imagePath: string;
  attributes: { color?: string; layout: string; split?: string };
  visibleText: string[];
  sourceText: string;
  ocrText: string;
  sourcePath: string;
  imageSha256: string;
  warning?: string;
}
export interface ImageReviewQuestion {
  id: string;
  text: string;
  kind: string;
  family: string;
  gold: string[];
  status: string;
  primary: boolean;
  reason: string;
  split?: string;
  knownAlternatives?: string[];
}
export interface ImageReviewRow {
  questionId: string;
  arm: ImageReviewArm;
  repetition: 1;
  ranking: { evidenceId: string; score: number }[];
  metrics: ImageReviewMetrics | null;
  withinRanking: { evidenceId: string; score: number }[];
  withinMetrics: ImageReviewMetrics | null;
  withinHit1: number | null;
  sourceHit1: number | null;
  expectedHit1: number | null;
  withinExpectedHit1: number | null;
  topicOnlyHit1: number | null;
}
export interface ImageReviewSummary {
  arm: ImageReviewArm;
  kind: string;
  questions: number;
  fullHit1: number;
  withinHit1: number | null;
  sourceHit1: number;
  expectedHit1: number;
  recall5: number | null;
}
export interface ImageReviewTiming {
  ocrMs: number;
  clipLoadMs: number;
  clipTotalMs: number;
  peakRssKiB: number;
  imageMedianMs: number;
  queryMedianMs: number;
}
export interface ImageReviewDataset {
  id: ImageReviewDatasetId;
  title: string;
  description: string;
  measuredAt: string;
  limitations: string[];
  figures: ImageReviewFigure[];
  questions: ImageReviewQuestion[];
  rows: ImageReviewRow[];
  summary: ImageReviewSummary[];
  timing: ImageReviewTiming;
  freezeSha256: string;
  ledgerSha256: string;
  failureCases: { questionId: string; title: string; explanation: string }[];
}
export interface ImageReviewData {
  version: 'image-review-web-1';
  datasets: ImageReviewDataset[];
  provenance: {
    model: string;
    revision: string;
    dtype: string;
    device: string;
    dimensions: number;
    repetitions: number;
    displayedRepetition: 1;
    author: string;
    independentlyAdjudicated: false;
    providerApiCalls: 0;
    costNote: string;
    runtime: string;
    reportPath: string;
    repositoryUrl: string;
    sourceHead: string;
  };
}
